// A small example project in several languages, bundled with the app so a first-time user can
// explore "Understand Code" without having a project of their own.

export const SAMPLE_NAME = 'tiny-shop (example)';

export const SAMPLE_FILES: { path: string; text: string }[] = [
  {
    path: 'README.md',
    text: `# Tiny Shop

A very small example shop. It adds up the prices in a shopping cart, applies a discount
and tax, and shows the total on a web page. It exists so you can practise reading code.

## How it is organised

- \`main.py\` starts the program and prints a receipt.
- \`shop/cart.py\` keeps the list of products and calculates the total.
- \`shop/prices.py\` turns numbers into nicely formatted prices.
- \`settings.yaml\` stores the tax rate and the currency.
- \`web/\` contains the web page version (HTML, CSS and JavaScript).
- \`data/products.sql\` creates the product table in a database.
`,
  },
  {
    path: 'main.py',
    text: `"""Start the tiny shop: fill a cart and print a receipt."""

from shop.cart import Cart
from shop.prices import format_price

DISCOUNT = 5


def print_receipt(cart):
    """Show every product and the final total."""
    for name, price in cart.items:
        print(name, format_price(price))
    total = cart.total(discount=DISCOUNT)
    print("Total:", format_price(total))
    return total


if __name__ == "__main__":
    cart = Cart()
    cart.add("Notebook", 4.50)
    cart.add("Pencil", 1.20)
    cart.add("Backpack", 32.00)
    print_receipt(cart)
`,
  },
  {
    path: 'shop/__init__.py',
    text: `"""The shop package: shopping cart and price helpers."""
`,
  },
  {
    path: 'shop/cart.py',
    text: `"""A shopping cart that remembers products and calculates the total price."""

TAX_RATE = 0.2


class Cart:
    """Holds the products a customer wants to buy."""

    def __init__(self):
        self.items = []

    def add(self, name, price):
        """Put one product into the cart."""
        if price < 0:
            raise ValueError("A price cannot be negative")
        self.items.append((name, price))

    def subtotal(self):
        """Add up all prices, before discount and tax."""
        result = 0
        for _name, price in self.items:
            result = result + price
        return result

    def total(self, discount=0):
        """Subtotal minus the discount, plus tax."""
        amount = self.subtotal() - discount
        if amount < 0:
            amount = 0
        return amount * (1 + TAX_RATE)
`,
  },
  {
    path: 'shop/prices.py',
    text: `"""Turn numbers into prices people can read."""

CURRENCY = "EUR"


def format_price(value):
    """Round to cents and add the currency, e.g. 12.5 -> "12.50 EUR"."""
    rounded = round(value, 2)
    return f"{rounded:.2f} {CURRENCY}"
`,
  },
  {
    path: 'settings.yaml',
    text: `# Settings for the tiny shop
shop:
  name: "Tiny Shop"
  currency: EUR
  tax_rate: 0.2
discount:
  enabled: true
  amount: 5
`,
  },
  {
    path: 'web/index.html',
    text: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Tiny Shop</title>
    <link rel="stylesheet" href="style.css" />
  </head>
  <body>
    <h1>Tiny Shop</h1>
    <p>Prices: <span id="prices">4.50, 1.20, 32.00</span></p>
    <button id="calculate">Calculate total</button>
    <p class="total">Total: <span id="total">–</span></p>
    <script src="app.js"></script>
  </body>
</html>
`,
  },
  {
    path: 'web/app.js',
    text: `// Makes the "Calculate total" button work.
const TAX_RATE = 0.2;

function parsePrices(text) {
  return text.split(",").map((part) => Number(part.trim()));
}

function calculateTotal(prices, discount) {
  let sum = 0;
  for (const price of prices) {
    sum += price;
  }
  const amount = Math.max(0, sum - discount);
  return amount * (1 + TAX_RATE);
}

const button = document.getElementById("calculate");
button.addEventListener("click", () => {
  const prices = parsePrices(document.getElementById("prices").textContent);
  const total = calculateTotal(prices, 5);
  document.getElementById("total").textContent = total.toFixed(2) + " EUR";
});
`,
  },
  {
    path: 'web/style.css',
    text: `/* How the page looks */
body {
  font-family: sans-serif;
  margin: 2rem;
  color: #222;
}

#calculate {
  background: #2b6cb0;
  color: white;
  padding: 8px 16px;
  border: none;
  border-radius: 6px;
}

.total {
  font-size: 1.4rem;
  font-weight: bold;
}
`,
  },
  {
    path: 'data/products.sql',
    text: `-- The products table and a few example rows.
CREATE TABLE products (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  price DECIMAL(10, 2) NOT NULL
);

INSERT INTO products (name, price) VALUES ('Notebook', 4.50);
INSERT INTO products (name, price) VALUES ('Pencil', 1.20);
INSERT INTO products (name, price) VALUES ('Backpack', 32.00);

SELECT name, price FROM products WHERE price > 2 ORDER BY price;
`,
  },
];
