"""
app.py — AI-Powered Furniture Recommendation System
All ML + Flask logic in one file (Jupyter-notebook style).
"""
import os, re, ast
import numpy as np
import pandas as pd
from flask import Flask, render_template, request, jsonify
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from sklearn.neighbors import NearestNeighbors

# ═══════════════════════════════════════════════════════════
# 1. LOAD & CLEAN DATA
# ═══════════════════════════════════════════════════════════
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CSV_PATH = os.path.join(BASE_DIR, "dataset", "final_amazon_furniture.csv")

df = pd.read_csv(CSV_PATH, low_memory=False)
df = df.drop_duplicates(subset=["asin"]).reset_index(drop=True)


def parse_price(val):
    if pd.isna(val): return np.nan
    m = re.search(r"[\d,]+\.?\d*", str(val).replace(",", ""))
    return float(m.group()) if m else np.nan


def parse_category(val):
    if pd.isna(val): return "Uncategorized"
    try:
        cats = ast.literal_eval(val) if str(val).startswith("[") else [val]
        ignore = {"Home & Kitchen", "Patio, Lawn & Garden", "Baby Products",
                  "Tools & Home Improvement", "Electronics", "Furniture"}
        filtered = [c.strip() for c in cats if c.strip() not in ignore]
        return filtered[-1] if filtered else (cats[-1].strip() if cats else "Uncategorized")
    except Exception:
        return str(val).strip()


def extract_rating(spec):
    if pd.isna(spec): return np.nan
    m = re.search(r"(\d+\.\d+)\s+out of 5 stars", str(spec))
    return float(m.group(1)) if m else np.nan


def extract_reviews(spec):
    if pd.isna(spec): return np.nan
    m = re.search(r"([\d,]+)\s+rating", str(spec))
    return int(m.group(1).replace(",", "")) if m else np.nan


# Apply transformations
df["price_num"]    = df["price"].apply(parse_price)
df["price_num"]    = df["price_num"].fillna(df["price_num"].median())
df["category"]     = df["categories"].apply(parse_category)
df["rating"]       = df["specifications"].apply(extract_rating)
df["review_count"] = df["specifications"].apply(extract_reviews)
df["rating"]       = df["rating"].fillna(df["rating"].median() if df["rating"].notna().any() else 4.0)
df["review_count"] = df["review_count"].fillna(
    df["review_count"].median() if df["review_count"].notna().any() else 10
).astype(int)

for col in ["title", "brand", "style", "description", "about_item"]:
    df[col] = df[col].fillna("").astype(str)

df["combined_features"] = (
    df["title"] + " " + df["category"] + " " +
    df["description"] + " " + df["about_item"] + " " +
    df["brand"] + " " + df["style"]
)
df["image_url"]    = df["primary_image"].fillna("")
df["product_url"]  = "https://www.amazon.com/dp/" + df["asin"].astype(str)
df["popularity"]   = df["rating"] * np.log1p(df["review_count"])
df["price_tier"]   = df["price_num"].apply(
    lambda p: "budget" if p < 50 else ("mid" if p < 200 else "premium")
)

print(f"Loaded {len(df)} products.")

# ═══════════════════════════════════════════════════════════
# 2. TF-IDF (Content-Based)
# ═══════════════════════════════════════════════════════════
tfidf      = TfidfVectorizer(stop_words="english", max_features=5000)
tfidf_mat  = tfidf.fit_transform(df["combined_features"].fillna(""))
cos_sim    = cosine_similarity(tfidf_mat)   # full (n x n) matrix

# ═══════════════════════════════════════════════════════════
# 3. KNN
# ═══════════════════════════════════════════════════════════
knn = NearestNeighbors(n_neighbors=min(20, len(df)), metric="cosine", algorithm="brute")
knn.fit(tfidf_mat)

# ═══════════════════════════════════════════════════════════
# 4. Popularity normalised [0,1]
# ═══════════════════════════════════════════════════════════
pop_vals = df["popularity"].values.astype(float)
mn, mx   = pop_vals.min(), pop_vals.max()
norm_pop = (pop_vals - mn) / (mx - mn + 1e-9)

# ═══════════════════════════════════════════════════════════
# 5. UI lookup lists
# ═══════════════════════════════════════════════════════════
CATEGORIES = sorted(df["category"].unique().tolist())
TITLES     = df["title"].dropna().tolist()
PAGE_SIZE  = 10

# Pre-build category -> indices map for FBT
cat_map = {k: v.tolist() for k, v in df.groupby("category").groups.items()}


# ═══════════════════════════════════════════════════════════
# 6. Helper functions
# ═══════════════════════════════════════════════════════════
def fbt_for(idx, top_n=4):
    """Frequently Bought Together: same category, similar price tier."""
    row = df.iloc[idx]
    same_cat = [i for i in cat_map.get(row["category"], []) if i != idx]
    same_tier = df[
        (df["price_tier"] == row["price_tier"]) & (df.index != idx)
    ].index.tolist()
    combined = same_cat + same_tier
    seen, unique = set(), []
    for i in combined:
        if i not in seen:
            seen.add(i)
            unique.append(i)
    return unique[:top_n]


def product_dict(idx):
    row = df.iloc[idx]
    # Clean up about_item for description display
    desc = str(row.get("about_item", ""))[:300].strip()
    if not desc:
        desc = str(row.get("description", ""))[:300].strip()
    return {
        "id":           int(idx),
        "asin":         str(row.get("asin", "")),
        "title":        str(row["title"]),
        "brand":        str(row.get("brand", "")),
        "price":        round(float(row["price_num"]), 2),
        "price_display":f"${float(row['price_num']):.2f}",
        "rating":       round(float(row["rating"]), 1),
        "review_count": int(row["review_count"]),
        "category":     str(row["category"]),
        "style":        str(row.get("style", "")),
        "description":  desc,
        "image_url":    str(row.get("image_url", "")),
        "product_url":  str(row.get("product_url", "#")),
    }


def hybrid_recommend(query, min_price=0, max_price=1e6,
                     category="", min_rating=0, page=1):
    """Hybrid: TF-IDF 50% + KNN 30% + Popularity 20%, with filters + pagination."""
    # --- content scores ---
    q_vec = tfidf.transform([query])
    tfidf_scores = cosine_similarity(q_vec, tfidf_mat)[0]

    # --- KNN scores ---
    _, knn_idx = knn.kneighbors(q_vec, n_neighbors=min(50, len(df)))
    knn_scores = np.zeros(len(df))
    for rank, i in enumerate(knn_idx.flatten()):
        knn_scores[i] = 1.0 - rank / max(50, 1)

    combined = 0.5 * tfidf_scores + 0.3 * knn_scores + 0.2 * norm_pop

    # --- filters ---
    mask = (
        (df["price_num"].values >= min_price) &
        (df["price_num"].values <= max_price) &
        (df["rating"].values >= min_rating)
    )
    if category and category not in ("", "All"):
        mask &= df["category"].str.contains(category, case=False, na=False).values

    combined *= mask.astype(float)
    ranked = [int(i) for i in np.argsort(combined)[::-1] if combined[i] > 0]

    # fallback to popularity
    if not ranked:
        ranked = [int(i) for i in np.argsort(norm_pop)[::-1] if mask[i]]

    total       = len(ranked)
    total_pages = max(1, (total + PAGE_SIZE - 1) // PAGE_SIZE)
    page        = max(1, min(page, total_pages))
    page_slice  = ranked[(page - 1) * PAGE_SIZE : page * PAGE_SIZE]

    return {
        "results":     [product_dict(i) for i in page_slice],
        "total":       total,
        "page":        page,
        "page_size":   PAGE_SIZE,
        "total_pages": total_pages,
    }


def popular_products(page=1, category="", min_rating=0,
                     min_price=0, max_price=1e6):
    mask = (
        (df["price_num"].values >= min_price) &
        (df["price_num"].values <= max_price) &
        (df["rating"].values >= min_rating)
    )
    if category and category not in ("", "All"):
        mask &= df["category"].str.contains(category, case=False, na=False).values

    scores = norm_pop * mask.astype(float)
    ranked = [int(i) for i in np.argsort(scores)[::-1] if scores[i] > 0]

    total       = len(ranked)
    total_pages = max(1, (total + PAGE_SIZE - 1) // PAGE_SIZE)
    page        = max(1, min(page, total_pages))
    page_slice  = ranked[(page - 1) * PAGE_SIZE : page * PAGE_SIZE]

    return {
        "results":     [product_dict(i) for i in page_slice],
        "total":       total,
        "page":        page,
        "page_size":   PAGE_SIZE,
        "total_pages": total_pages,
    }


# ═══════════════════════════════════════════════════════════
# 7. Flask App
# ═══════════════════════════════════════════════════════════
app = Flask(__name__)


@app.route("/")
def index():
    initial = popular_products()
    return render_template(
        "index.html",
        categories=CATEGORIES,
        initial_results=initial,
    )


@app.route("/recommend", methods=["POST"])
def recommend():
    data       = request.get_json(force=True) or {}
    query      = str(data.get("query", "")).strip()
    min_price  = float(data.get("min_price", 0))
    max_price  = float(data.get("max_price", 1_000_000))
    category   = str(data.get("category", "")).strip()
    min_rating = float(data.get("min_rating", 0))
    page       = int(data.get("page", 1))

    if query:
        result = hybrid_recommend(query, min_price, max_price, category, min_rating, page)
    else:
        result = popular_products(page, category, min_rating, min_price, max_price)
    return jsonify(result)


@app.route("/product/<int:pid>")
def product_detail(pid):
    """Return full product data + FBT for the modal."""
    if pid < 0 or pid >= len(df):
        return jsonify({"error": "Not found"}), 404
    p = product_dict(pid)
    p["fbt"] = [product_dict(i) for i in fbt_for(pid, top_n=4)]
    return jsonify(p)


@app.route("/api/products", methods=["POST"])
def get_products_bulk():
    """Return details for multiple products by ID."""
    data = request.get_json(force=True) or {}
    pids = data.get("ids", [])
    results = []
    for pid in pids:
        try:
            pid_int = int(pid)
            if 0 <= pid_int < len(df):
                results.append(product_dict(pid_int))
        except (ValueError, TypeError):
            continue
    return jsonify(results)


@app.route("/autocomplete")
def autocomplete():
    """
    Return category suggestions first, then product title suggestions.
    Prioritise categories so typing 'bed' shows 'Bedroom Furniture' at top.
    """
    q = request.args.get("q", "").strip().lower()
    if not q or len(q) < 2:
        return jsonify([])

    # 1. Category matches
    cat_hits = [c for c in CATEGORIES if q in c.lower()][:5]

    # 2. Product title matches (excluding ones already covered)
    title_hits = [t for t in TITLES if q in t.lower()][:8]

    # Combine: categories first, then titles, deduplicate
    seen = set(cat_hits)
    combined = cat_hits[:]
    for t in title_hits:
        if t not in seen:
            seen.add(t)
            combined.append(t)

    return jsonify(combined[:10])


if __name__ == "__main__":
    app.run(debug=True, port=5000)
