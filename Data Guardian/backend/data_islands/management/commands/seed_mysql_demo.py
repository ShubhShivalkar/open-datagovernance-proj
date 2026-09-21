"""
Management command: seed_mysql_demo

Populates the MAMP MySQL `mydatabase` with a realistic e-commerce dataset
for demoing the Data Islands feature.

Tables created:
  customers    — 75 rows
  products     — 60 rows
  orders       — 80 rows
  order_items  — ~200 rows (2-3 items per order on average)

Usage:
  python manage.py seed_mysql_demo

Connection target: host=127.0.0.1, port=8889, user=root, password=root, db=mydatabase
"""

import random
import datetime
from django.core.management.base import BaseCommand
import pymysql


# ---------------------------------------------------------------------------
# Connection config — matches the MAMP server verified working
# ---------------------------------------------------------------------------
CONN_PARAMS = dict(
    host="127.0.0.1",
    port=8889,
    user="root",
    password="root",
    db="mydatabase",
    autocommit=True,
    charset="utf8mb4",
)

# ---------------------------------------------------------------------------
# Seed data pools
# ---------------------------------------------------------------------------
FIRST_NAMES = [
    "Alice", "Bob", "Carol", "Dave", "Eve", "Frank", "Grace", "Hank",
    "Irene", "Jack", "Karen", "Leo", "Mia", "Nate", "Olivia", "Paul",
    "Quinn", "Rachel", "Sam", "Tina", "Uma", "Victor", "Wendy", "Xander",
    "Yara", "Zoe", "Liam", "Emma", "Noah", "Ava",
]

LAST_NAMES = [
    "Smith", "Jones", "Williams", "Brown", "Davis", "Miller", "Wilson",
    "Moore", "Taylor", "Anderson", "Thomas", "Jackson", "White", "Harris",
    "Martin", "Thompson", "Garcia", "Martinez", "Robinson", "Clark",
    "Rodriguez", "Lewis", "Lee", "Walker", "Hall", "Allen", "Young",
    "King", "Wright", "Scott",
]

CITIES = [
    ("New York", "US"), ("Los Angeles", "US"), ("Chicago", "US"),
    ("Houston", "US"), ("Phoenix", "US"), ("Austin", "US"),
    ("Seattle", "US"), ("Denver", "US"), ("Miami", "US"),
    ("Boston", "US"), ("London", "GB"), ("Berlin", "DE"),
    ("Paris", "FR"), ("Toronto", "CA"), ("Sydney", "AU"),
]

PRODUCTS = [
    ("Wireless Headphones Pro",    "Electronics",  129.99, 45),
    ("Bluetooth Speaker X2",       "Electronics",   79.99, 80),
    ("USB-C Hub 7-Port",           "Electronics",   49.99, 120),
    ("Mechanical Keyboard TKL",    "Electronics",   89.99, 60),
    ("27\" 4K Monitor",            "Electronics",  349.99, 25),
    ("Laptop Stand Aluminium",     "Electronics",   39.99, 90),
    ("Webcam HD 1080p",            "Electronics",   59.99, 70),
    ("Smart Watch Series 5",       "Electronics",  199.99, 35),
    ("Noise-Cancel Earbuds",       "Electronics",   99.99, 55),
    ("Portable Charger 20000mAh",  "Electronics",   34.99, 100),
    ("Running Shoes X1",           "Apparel",        89.99, 50),
    ("Yoga Pants Pro",             "Apparel",        44.99, 75),
    ("Merino Wool Sweater",        "Apparel",        69.99, 40),
    ("Waterproof Jacket",          "Apparel",       119.99, 30),
    ("Cotton T-Shirt 3-Pack",      "Apparel",        29.99, 150),
    ("Denim Jeans Classic",        "Apparel",        59.99, 80),
    ("Compression Socks",          "Apparel",        14.99, 200),
    ("Baseball Cap",               "Apparel",        19.99, 120),
    ("Leather Belt",               "Apparel",        24.99, 90),
    ("Sunglasses UV400",           "Apparel",        34.99, 60),
    ("Coffee Maker 12-Cup",        "Home",           79.99, 40),
    ("Air Purifier HEPA",          "Home",          149.99, 25),
    ("Robot Vacuum V3",            "Home",          249.99, 20),
    ("Bamboo Cutting Board Set",   "Home",           29.99, 110),
    ("Non-Stick Pan Set",          "Home",           59.99, 55),
    ("Electric Kettle 1.7L",       "Home",           34.99, 80),
    ("Bed Linen Set King",         "Home",           79.99, 35),
    ("Scented Candle Set",         "Home",           19.99, 140),
    ("Plant Pot Set Ceramic",      "Home",           24.99, 95),
    ("Storage Ottoman",            "Home",           89.99, 20),
    ("Yoga Mat Premium",           "Sports",         49.99, 85),
    ("Resistance Bands Set",       "Sports",         19.99, 160),
    ("Foam Roller Deep Tissue",    "Sports",         24.99, 75),
    ("Jump Rope Speed",            "Sports",          9.99, 200),
    ("Dumbbell Set Adjustable",    "Sports",         89.99, 30),
    ("Gym Bag Large",              "Sports",         39.99, 65),
    ("Water Bottle Insulated",     "Sports",         24.99, 180),
    ("Protein Shaker 700ml",       "Sports",         12.99, 150),
    ("Cycling Gloves",             "Sports",         14.99, 90),
    ("Running Armband Phone",      "Sports",         11.99, 110),
    ("Python Crash Course",        "Books",          29.99, 50),
    ("Clean Code",                 "Books",          34.99, 40),
    ("Designing Data-Intensive Apps","Books",        44.99, 35),
    ("The Pragmatic Programmer",   "Books",          39.99, 40),
    ("System Design Interview",    "Books",          34.99, 55),
    ("Deep Learning with Python",  "Books",          49.99, 30),
    ("Data Science Handbook",      "Books",          44.99, 25),
    ("SQL Performance Explained",  "Books",          29.99, 45),
    ("The Phoenix Project",        "Books",          17.99, 60),
    ("Atomic Habits",              "Books",          16.99, 80),
    ("Wireless Mouse Slim",        "Electronics",    29.99, 130),
    ("HDMI Cable 2m",              "Electronics",     8.99, 250),
    ("Desk Lamp LED Dimmable",     "Home",           39.99, 70),
    ("Hand Grip Strengthener",     "Sports",          7.99, 180),
    ("Meditation Cushion",         "Sports",         29.99, 45),
    ("Cookbooks: Italian Cuisine", "Books",          24.99, 35),
    ("Power Strip 6-Outlet",       "Electronics",    19.99, 95),
    ("Desk Organiser Bamboo",      "Home",           22.99, 85),
    ("Phone Stand Adjustable",     "Electronics",    11.99, 140),
    ("Thermal Flask 500ml",        "Sports",         19.99, 120),
]

ORDER_STATUSES = ["pending", "processing", "shipped", "delivered", "cancelled"]
STATUS_WEIGHTS = [15, 20, 25, 30, 10]   # % distribution


class Command(BaseCommand):
    help = "Seed MAMP MySQL mydatabase with demo e-commerce data for Data Islands"

    def handle(self, *args, **options):
        random.seed(42)   # reproducible data

        self.stdout.write("Connecting to MAMP MySQL...")
        conn = pymysql.connect(**CONN_PARAMS)
        cur = conn.cursor()

        # ── 1. Drop existing tables in FK-safe order ──────────────────
        self.stdout.write("Dropping existing tables...")
        for table in ("order_items", "orders", "products", "customers"):
            cur.execute(f"DROP TABLE IF EXISTS `{table}`")

        # ── 2. Create tables ──────────────────────────────────────────
        self.stdout.write("Creating tables...")

        cur.execute("""
            CREATE TABLE customers (
                id         INT AUTO_INCREMENT PRIMARY KEY,
                first_name VARCHAR(100) NOT NULL,
                last_name  VARCHAR(100) NOT NULL,
                email      VARCHAR(255) NOT NULL UNIQUE,
                phone      VARCHAR(20),
                city       VARCHAR(100),
                country    VARCHAR(10) DEFAULT 'US',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """)

        cur.execute("""
            CREATE TABLE products (
                id         INT AUTO_INCREMENT PRIMARY KEY,
                name       VARCHAR(255) NOT NULL,
                category   VARCHAR(100) NOT NULL,
                price      DECIMAL(10,2) NOT NULL,
                stock_qty  INT NOT NULL DEFAULT 0,
                sku        VARCHAR(50) NOT NULL UNIQUE,
                is_active  TINYINT(1) NOT NULL DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """)

        cur.execute("""
            CREATE TABLE orders (
                id               INT AUTO_INCREMENT PRIMARY KEY,
                customer_id      INT NOT NULL,
                status           ENUM('pending','processing','shipped','delivered','cancelled') NOT NULL DEFAULT 'pending',
                shipping_address TEXT,
                total_amount     DECIMAL(10,2) NOT NULL DEFAULT 0.00,
                created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                shipped_at       TIMESTAMP NULL,
                CONSTRAINT fk_orders_customer FOREIGN KEY (customer_id) REFERENCES customers(id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """)

        cur.execute("""
            CREATE TABLE order_items (
                id          INT AUTO_INCREMENT PRIMARY KEY,
                order_id    INT NOT NULL,
                product_id  INT NOT NULL,
                quantity    INT NOT NULL DEFAULT 1,
                unit_price  DECIMAL(10,2) NOT NULL,
                line_total  DECIMAL(10,2) NOT NULL,
                CONSTRAINT fk_items_order   FOREIGN KEY (order_id)   REFERENCES orders(id),
                CONSTRAINT fk_items_product FOREIGN KEY (product_id) REFERENCES products(id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """)

        # ── 3. Insert customers (75 rows) ─────────────────────────────
        self.stdout.write("Inserting 75 customers...")
        used_emails = set()
        customers = []
        while len(customers) < 75:
            fn = random.choice(FIRST_NAMES)
            ln = random.choice(LAST_NAMES)
            email_base = f"{fn.lower()}.{ln.lower()}"
            email = f"{email_base}{len(customers)}@example.com"
            if email in used_emails:
                continue
            used_emails.add(email)
            phone = f"+1-{random.randint(200,999)}-{random.randint(100,999)}-{random.randint(1000,9999)}"
            city, country = random.choice(CITIES)
            days_ago = random.randint(30, 730)
            created = datetime.datetime.now() - datetime.timedelta(days=days_ago)
            customers.append((fn, ln, email, phone, city, country, created))

        cur.executemany(
            "INSERT INTO customers (first_name,last_name,email,phone,city,country,created_at) VALUES (%s,%s,%s,%s,%s,%s,%s)",
            customers,
        )

        # ── 4. Insert products (60 rows) ──────────────────────────────
        self.stdout.write("Inserting 60 products...")
        products = []
        for i, (name, category, price, stock) in enumerate(PRODUCTS):
            sku = f"SKU-{category[:3].upper()}-{i+1:04d}"
            days_ago = random.randint(60, 1000)
            created = datetime.datetime.now() - datetime.timedelta(days=days_ago)
            products.append((name, category, price, stock, sku, 1, created))

        cur.executemany(
            "INSERT INTO products (name,category,price,stock_qty,sku,is_active,created_at) VALUES (%s,%s,%s,%s,%s,%s,%s)",
            products,
        )

        # ── 5. Insert orders (80 rows) ────────────────────────────────
        self.stdout.write("Inserting 80 orders...")
        orders = []
        for _ in range(80):
            customer_id = random.randint(1, 75)
            order_status = random.choices(ORDER_STATUSES, weights=STATUS_WEIGHTS)[0]
            city, country = random.choice(CITIES)
            address = f"{random.randint(1, 9999)} Main St, {city}, {country}"
            days_ago = random.randint(1, 180)
            created = datetime.datetime.now() - datetime.timedelta(days=days_ago)
            shipped_at = None
            if order_status in ("shipped", "delivered"):
                shipped_at = created + datetime.timedelta(days=random.randint(1, 5))
            orders.append((customer_id, order_status, address, 0.00, created, shipped_at))

        cur.executemany(
            "INSERT INTO orders (customer_id,status,shipping_address,total_amount,created_at,shipped_at) VALUES (%s,%s,%s,%s,%s,%s)",
            orders,
        )

        # ── 6. Insert order_items (2-3 per order, ~200 rows) ──────────
        self.stdout.write("Inserting order items...")
        items = []
        for order_id in range(1, 81):
            num_items = random.randint(1, 4)
            product_ids = random.sample(range(1, 61), min(num_items, 60))
            for product_id in product_ids:
                qty = random.randint(1, 3)
                # price snapshot from PRODUCTS list (product_id is 1-based)
                unit_price = PRODUCTS[product_id - 1][2]
                line_total = round(qty * unit_price, 2)
                items.append((order_id, product_id, qty, unit_price, line_total))

        cur.executemany(
            "INSERT INTO order_items (order_id,product_id,quantity,unit_price,line_total) VALUES (%s,%s,%s,%s,%s)",
            items,
        )

        # ── 7. Update orders.total_amount from order_items ────────────
        self.stdout.write("Calculating order totals...")
        cur.execute("""
            UPDATE orders o
            JOIN (
                SELECT order_id, SUM(line_total) AS total
                FROM order_items
                GROUP BY order_id
            ) t ON t.order_id = o.id
            SET o.total_amount = t.total
        """)

        conn.close()

        self.stdout.write(self.style.SUCCESS(
            f"\nSeeded mydatabase successfully:\n"
            f"  customers:   75 rows\n"
            f"  products:    60 rows\n"
            f"  orders:      80 rows\n"
            f"  order_items: {len(items)} rows\n"
            f"\nSample Data Island queries you can try:\n"
            f"  SELECT * FROM customers\n"
            f"  SELECT * FROM products WHERE category = 'Electronics'\n"
            f"  SELECT o.id, c.email, o.status, o.total_amount FROM orders o JOIN customers c ON c.id = o.customer_id\n"
            f"  SELECT p.category, COUNT(*) AS items_sold, SUM(oi.line_total) AS revenue FROM order_items oi JOIN products p ON p.id = oi.product_id GROUP BY p.category\n"
        ))
