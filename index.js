// index.js
require("dotenv").config();
const express = require("express");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3000;
const PRINTIFY_API_TOKEN = process.env.PRINTIFY_API_TOKEN;
const SHOP_ID = process.env.PRINTIFY_SHOP_ID;

app.use(express.json()); // needed to parse JSON bodies

// Get products from Printify
app.get("/products", async (req, res) => {
  try {
    const response = await axios.get(
      `https://api.printify.com/v1/shops/${SHOP_ID}/products.json`,
      {
        headers: { Authorization: `Bearer ${PRINTIFY_API_TOKEN}` },
      }
    );
    res.json(response.data);
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({ error: "Failed to fetch products" });
  }
});

// Create an order in Printify
app.post("/order", async (req, res) => {
  const { product_id, variant_id, quantity, address } = req.body;

  if (!product_id || !variant_id || !quantity || !address) {
    return res.status(400).json({ error: "Missing order information" });
  }

  const orderPayload = {
    line_items: [
      {
        variant_id,
        quantity,
      },
    ],
    shipping_method: "standard",
    address_to: address,
    send_receipt: true,
  };

  try {
    const response = await axios.post(
      `https://api.printify.com/v1/shops/${SHOP_ID}/orders.json`,
      orderPayload,
      {
        headers: { Authorization: `Bearer ${PRINTIFY_API_TOKEN}` },
      }
    );

    res.json(response.data);
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({ error: "Failed to create order" });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

