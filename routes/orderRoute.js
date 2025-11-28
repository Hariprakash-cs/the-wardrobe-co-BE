const { v4: uuidv4 } = require("uuid");
const express = require("express");
const router = express.Router();
const axios = require("axios");
const stripe = require("stripe")(
  "sk_test_51LeHpZIjTW834vhapGxONtJOuSIA960xmS94XHdU8Cy175Jd0vUmyc26kRrklsxheUg5mJ1RouA94VjVQb4Xqd4g00w513MhUX"
);
// const stripe = require("stripe")("sk_test_51IYnC0SIR2AbPxU0EiMx1fTwzbZXLbkaOcbc2cXx49528d9TGkQVjUINJfUDAnQMVaBFfBDP5xtcHCkZG1n1V3E800U7qXFmGf")
const Order = require("../models/orderModel");

// Contentstack Configuration
const CONTENTSTACK_CONFIG = {
  apiKey: "blt3435e7e7f3e56dcc",
  accessToken: "cseab624052afe37759c0de021",
  environment: "main",
  baseURL: "https://cdn.contentstack.io/v3",
};

// Contentstack Automation Endpoint
const CONTENTSTACK_AUTOMATION_URL =
  "https://app.contentstack.com/automations-api/run/af7b65e7a0a746559daac2575cc86132";
const CONTENTSTACK_AUTOMATION_KEY = "L9*hchoia";

// Function to fetch current stock from Contentstack
async function getCurrentStockFromContentstack(productUid) {
  try {
    const url = `${CONTENTSTACK_CONFIG.baseURL}/content_types/home/entries/${productUid}?environment=${CONTENTSTACK_CONFIG.environment}`;

    const response = await axios.get(url, {
      headers: {
        api_key: CONTENTSTACK_CONFIG.apiKey,
        access_token: CONTENTSTACK_CONFIG.accessToken,
        "Content-Type": "application/json",
      },
    });

    if (response.data && response.data.entry) {
      const currentStock = response.data.entry.stock_count || 0;
      return { success: true, stock: currentStock };
    }

    return { success: false, error: "Entry not found" };
  } catch (error) {
    console.error(
      `❌ Error fetching stock for product ${productUid}:`,
      error.message
    );
    return { success: false, error: error.message };
  }
}

// Function to reduce stock in Contentstack
async function reduceStockInContentstack(productUid, quantity) {
  try {
    // Step 1: Fetch current stock from Contentstack
    const stockResult = await getCurrentStockFromContentstack(productUid);

    if (!stockResult.success) {
      throw new Error(`Failed to fetch current stock: ${stockResult.error}`);
    }

    const currentStock = stockResult.stock;

    // Step 2: Calculate new stock count
    const newStockCount = Math.max(0, currentStock - quantity);

    // Step 3: Send update to Contentstack automation
    const response = await axios.post(
      CONTENTSTACK_AUTOMATION_URL,
      {
        uid: productUid,
        stock_count: quantity,
        current_stock: currentStock,
        new_stock_count: newStockCount, // Pre-calculated value
      },
      {
        headers: {
          "ah-http-key": CONTENTSTACK_AUTOMATION_KEY,
          "Content-Type": "application/json",
        },
      }
    );

    return { success: true, data: response.data };
  } catch (error) {
    console.error(
      `❌ Error reducing stock for product ${productUid}:`,
      error.message
    );
    return { success: false, error: error.message };
  }
}
router.post("/placeorder", async (req, res) => {
  const { token, cartItems, currentUser, subtotal } = req.body;

  const customer = await stripe.customers.create({
    email: token.email,
    source: token.id,
  });

  const payment = await stripe.charges.create(
    {
      amount: subtotal * 100,
      currency: "inr",
      customer: customer.id,
      receipt_email: token.email,
    },
    {
      idempotencyKey: uuidv4(),
    }
  );

  if (payment) {
    const order = new Order({
      userid: currentUser._id,
      name: currentUser.name,
      email: currentUser.email,
      orderItems: cartItems,
      shippingAddress: {
        address: token.card.address_line1,
        city: token.card.address_city,
        country: token.card.address_country,
        postalCode: token.card.addres_zip,
      },
      orderAmount: subtotal,
      transactionId: payment.source.id,
      isDelivered: false,
    });

    order.save(async (err) => {
      if (err) {
        return res.status(400).json({ message: "Something went wrong" });
      } else {
        // Reduce stock in Contentstack for each product
        const stockUpdatePromises = cartItems.map((item) => {
          return reduceStockInContentstack(item._id, item.quantity);
        });

        // Wait for all stock updates to complete
        const stockUpdateResults = await Promise.all(stockUpdatePromises);

        // Check if any stock updates failed
        const failedUpdates = stockUpdateResults.filter(
          (result) => !result.success
        );
        if (failedUpdates.length > 0) {
          console.warn(`⚠️ Some stock updates failed:`, failedUpdates);
          // Note: Order is still placed successfully, but stock wasn't reduced in CMS
        }

        res.send("Order Placed Successfully");
      }
    });
  } else {
    return res.status(400).json({ message: "Payment failed" });
  }
});

router.post("/getordersbyuserid", (req, res) => {
  const userid = req.body.userid;

  Order.find({ userid: userid })
    .sort({ createdAt: -1 })
    .exec((err, docs) => {
      if (err) {
        return res.status(400).json({ message: "something went wrong" });
      } else {
        res.send(docs);
      }
    });
});

router.post("/getorderbyid", (req, res) => {
  const orderid = req.body.orderid;

  Order.find({ _id: orderid }, (err, docs) => {
    if (err) {
      return res.status(400).json({ message: "something went wrong" });
    } else {
      res.send(docs[0]);
    }
  });
});

router.get("/getallorders", (req, res) => {
  Order.find({})
    .sort({ createdAt: -1 })
    .exec((err, docs) => {
      if (err) {
        return res.status(400).json({ message: "something went wrong" });
      } else {
        res.send(docs);
      }
    });
});

module.exports = router;
