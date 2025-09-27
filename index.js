import express from 'express';
import fetch from 'node-fetch';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Printify API config
const PRINTIFY_API = 'https://api.printify.com/v1';
const PRINTIFY_SHOP_ID = process.env.PRINTIFY_SHOP_ID;
const PRINTIFY_TOKEN = process.env.PRINTIFY_API_TOKEN;

// PayPal config
const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
const PAYPAL_SECRET = process.env.PAYPAL_SECRET;
const PAYPAL_API = 'https://api-m.paypal.com'; // Sandbox: https://api-m.sandbox.paypal.com

// Helper: Get PayPal access token
async function getPayPalToken() {
  const auth = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_SECRET}`).toString('base64');
  const res = await fetch(`${PAYPAL_API}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  const data = await res.json();
  return data.access_token;
}

// ===== UPDATED PRODUCTS ROUTE =====
app.get('/products', async (req, res) => {
  try {
    const response = await fetch(`${PRINTIFY_API}/shops/${PRINTIFY_SHOP_ID}/products.json`, {
      headers: { Authorization: `Bearer ${PRINTIFY_TOKEN}` },
    });
    const data = await response.json();

    // Ensure we always send an array
    const products = Array.isArray(data.data) ? data.data : [];
    res.json({ data: products });
  } catch (err) {
    console.error('Printify fetch error:', err);
    res.status(500).json({ data: [], error: 'Failed to fetch products' });
  }
});

// Create PayPal order
app.post('/api/create-paypal-order', async (req, res) => {
  const { line_items } = req.body;
  const total = line_items.reduce((sum, item) => sum + item.price * item.quantity, 0).toFixed(2);

  try {
    const token = await getPayPalToken();
    const orderRes = await fetch(`${PAYPAL_API}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [
          {
            amount: { currency_code: 'GBP', value: total },
            items: line_items.map(item => ({
              name: item.title,
              unit_amount: { currency_code: 'GBP', value: item.price.toFixed(2) },
              quantity: item.quantity.toString(),
            })),
          },
        ],
      }),
    });
    const orderData = await orderRes.json();
    res.json({ id: orderData.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create PayPal order' });
  }
});

// Capture order and send to Printify
app.post('/api/create-order', async (req, res) => {
  const { orderID, line_items } = req.body;

  try {
    const token = await getPayPalToken();
    const captureRes = await fetch(`${PAYPAL_API}/v2/checkout/orders/${orderID}/capture`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
    const captureData = await captureRes.json();

    if (captureData.status !== 'COMPLETED') {
      return res.json({ success: false, message: 'Payment not completed' });
    }

    // Extract shipping info safely
    const purchaseUnit = captureData.purchase_units?.[0] || {};
    const payer = captureData.payer || {};
    const address = purchaseUnit.shipping?.address || {};

    const printifyOrder = {
      line_items: line_items.map(item => ({
        variant_id: parseInt(item.variant_id),
        quantity: item.quantity,
      })),
      shipping_method: 1, // standard shipping
      send_shipping_notification: true,
      address_to: {
        first_name: payer.name?.given_name || 'Customer',
        last_name: payer.name?.surname || '',
        email: payer.email_address || '',
        country: address.country_code || 'GB',
        region: address.admin_area_1 || '',
        address1: address.address_line_1 || '',
        address2: address.address_line_2 || '',
        city: address.admin_area_2 || '',
        zip: address.postal_code || '',
      },
    };

    const printifyRes = await fetch(`${PRINTIFY_API}/shops/${PRINTIFY_SHOP_ID}/orders.json`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${PRINTIFY_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(printifyOrder),
    });
    const printifyData = await printifyRes.json();

    res.json({ success: true, printifyData });
  } catch (err) {
    console.error(err);
    res.json({ success: false });
  }
});

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
