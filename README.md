# FurniFind — AI-Powered Furniture Recommendation System

An intelligent furniture recommendation engine built with **Flask** and **scikit-learn**. This system uses a hybrid approach combining **Content-Based Filtering (TF-IDF)** and **Collaborative Filtering (K-Nearest Neighbors)** to provide personalized furniture suggestions.

## 🚀 Features
- **Hybrid Recommendation Engine**: Uses TF-IDF (50%), KNN (30%), and Popularity (20%) scores.
- **Smart Autocomplete**: Suggests categories and product titles as you type.
- **Dynamic Filters**: Filter by category, minimum rating, and price range.
- **Frequently Bought Together**: Smart cross-selling recommendations based on category and price tier.
- **Favourites System**: Persistent local storage for saving your favourite pieces.
- **Responsive UI**: Premium design with smooth animations and modal views.

## 🛠️ Tech Stack
- **Backend**: Python, Flask
- **Machine Learning**: scikit-learn (TF-IDF, NearestNeighbors), NumPy, Pandas
- **Frontend**: Vanilla JS, CSS3, HTML5
- **Data**: Amazon Furniture Dataset (Sample)

## 📦 Installation & Setup

1. **Clone the repository**:
   ```bash
   git clone https://github.com/yourusername/furniture-recommendation-system.git
   cd furniture-recommendation-system
   ```

2. **Create a virtual environment**:
   ```bash
   python -m venv venv
   source venv/bin/scripts/activate  # On Windows: venv\Scripts\activate
   ```

3. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

4. **Run the application**:
   ```bash
   python app.py
   ```
   Open `http://127.0.0.1:5000` in your browser.

## 📂 Project Structure
- `app.py`: Main Flask application containing recommendation logic.
- `dataset/`: Contains the furniture product data.
- `static/`: CSS and JS assets.
- `templates/`: HTML templates.
- `requirements.txt`: List of Python dependencies.

