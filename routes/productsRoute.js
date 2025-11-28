const express = require("express");
const router = express.Router();
const axios = require("axios");
const Product = require("../models/productModel");
const Review = require("../models/reviewModel");

// Contentstack Configuration
const CONTENTSTACK_CONFIG = {
  apiKey: "blt3435e7e7f3e56dcc",
  accessToken: "cseab624052afe37759c0de021",
  environment: "main",
  baseURL: "https://cdn.contentstack.io/v3",
};

// Contentstack Automation Configuration for Rating Updates
const CONTENTSTACK_RATING_AUTOMATION_URL =
  "https://app.contentstack.com/automations-api/run/12b2dadac7614c9f81e25a2500794e88";
const CONTENTSTACK_RATING_AUTOMATION_KEY = "T3^upokzlyw";

// Function to fetch current rating from Contentstack
async function getCurrentRatingFromContentstack(productUid) {
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
      const currentRating = response.data.entry.ratings || 0; // Note: field is "ratings" (plural) in CMS
      const currentReviewCount = response.data.entry.total_reviews || 0;
      return {
        success: true,
        rating: currentRating,
        reviewCount: currentReviewCount,
      };
    }

    return { success: false, error: "Entry not found" };
  } catch (error) {
    console.error(
      `❌ Error fetching rating for product ${productUid}:`,
      error.message
    );
    return { success: false, error: error.message };
  }
}

// Function to update product rating in Contentstack (Efficient - simplified payload)
async function updateRatingInContentstack(productUid, newReviewRating) {
  try {
    // Step 1: Fetch current rating and review count from Contentstack
    const ratingResult = await getCurrentRatingFromContentstack(productUid);

    if (!ratingResult.success) {
      throw new Error(`Failed to fetch current rating: ${ratingResult.error}`);
    }

    const currentRating = ratingResult.rating;
    const currentReviewCount = ratingResult.reviewCount;

    // Step 2: Calculate new average rating (1-5 scale)
    // Formula: (current_avg * current_count + new_rating) / (current_count + 1)
    const newTotalReviews = currentReviewCount + 1;
    const newAverageRating =
      (currentRating * currentReviewCount + newReviewRating) / newTotalReviews;

    // Round to 1 decimal place for clean star display (e.g., 4.5, 4.3)
    const roundedNewRating = Math.round(newAverageRating * 10) / 10;

    // Ensure rating stays within 1-5 range
    const finalRating = Math.max(1, Math.min(5, roundedNewRating));

    // Step 3: Send simplified payload to Contentstack automation
    const response = await axios.post(
      CONTENTSTACK_RATING_AUTOMATION_URL,
      {
        uid: productUid,
        ratings: finalRating, // New average rating (1-5 scale)
        total_reviews: newTotalReviews, // New total review count
      },
      {
        headers: {
          "ah-http-key": CONTENTSTACK_RATING_AUTOMATION_KEY,
          "Content-Type": "application/json",
        },
      }
    );

    console.log(
      `✅ Rating updated in Contentstack for product ${productUid}: ${currentRating} → ${finalRating} stars (${newTotalReviews} reviews)`
    );
    return {
      success: true,
      data: response.data,
      newAverageRating: finalRating,
      newTotalReviews: newTotalReviews,
    };
  } catch (error) {
    console.error(
      `❌ Error updating rating in Contentstack for product ${productUid}:`,
      error.message
    );
    return { success: false, error: error.message };
  }
}

router.get("/getallproducts", (req, res) => {
  Product.find({}, (err, docs) => {
    if (!err) {
      return res.send(docs);
    } else {
      return res.status(400).json({ message: "Something went wrong" });
    }
  });
});

router.post("/getproductbyid", (req, res) => {
  Product.find({ _id: req.body.productid }, (err, docs) => {
    if (!err) {
      res.send(docs[0]);
    } else {
      return res.status(400).json({ message: "something went wrong" });
    }
  });
});

// Add review without product validation (products are in CMS, reviews in MongoDB)
router.post("/addreview", async (req, res) => {
  try {
    const { review, productid, currentUser } = req.body;

    // Create new review document
    const newReview = new Review({
      productid: productid,
      userid: currentUser._id,
      name: currentUser.name,
      rating: review.rating,
      comment: review.comment,
    });

    await newReview.save();

    // Update rating in Contentstack CMS via automation
    // This will fetch current rating from CMS and calculate new average
    const updateResult = await updateRatingInContentstack(
      productid,
      review.rating
    );

    if (!updateResult.success) {
      console.warn(
        `⚠️ Review saved but failed to update rating in CMS: ${updateResult.error}`
      );
    }

    res.status(200).json({
      message: "Review submitted successfully",
      review: newReview,
      averageRating: updateResult.newAverageRating || null,
      totalReviews: updateResult.newTotalReviews || null,
    });
  } catch (err) {
    console.error("Error adding review:", err);
    res.status(400).json({ message: "Something went wrong: " + err.message });
  }
});

// Get all reviews for a specific product
router.get("/getreviews/:productid", async (req, res) => {
  try {
    const { productid } = req.params;
    const reviews = await Review.find({ productid: productid }).sort({
      createdAt: -1,
    });

    // Calculate average rating
    const averageRating =
      reviews.length > 0
        ? reviews.reduce((acc, review) => acc + review.rating, 0) /
          reviews.length
        : 0;

    res.status(200).json({
      reviews: reviews,
      averageRating: averageRating,
      totalReviews: reviews.length,
    });
  } catch (err) {
    console.error("Error fetching reviews:", err);
    res.status(400).json({ message: "Something went wrong: " + err.message });
  }
});

// Check if user has already reviewed a product
router.post("/checkreview", async (req, res) => {
  try {
    const { productid, userid } = req.body;
    const existingReview = await Review.findOne({
      productid: productid,
      userid: userid,
    });

    res.status(200).json({
      hasReviewed: !!existingReview,
      review: existingReview,
    });
  } catch (err) {
    console.error("Error checking review:", err);
    res.status(400).json({ message: "Something went wrong: " + err.message });
  }
});

router.post("/deleteproduct", (req, res) => {
  Product.findByIdAndDelete(req.body.productid, (err) => {
    if (err) {
      return res.status(400).json({ message: "Something went wrong" + err });
    } else {
      res.send("Product deleted successfully");
    }
  });
});

router.post("/addproduct", (req, res) => {
  const { product } = req.body;

  console.log(product);

  const productModel = new Product({
    name: product.name,
    price: product.price,
    description: product.description,
    countInStock: product.countInStock,
    image: product.image,
    category: product.category,
  });

  productModel.save((err) => {
    if (err) {
      return res.status(400).json({ message: "Something went wrong" });
    } else {
      res.send("Product Added Successfully");
    }
  });
});

router.post("/updateproduct", (req, res) => {
  Product.findByIdAndUpdate(
    req.body.productid,
    {
      name: req.body.updatedproduct.name,
      price: req.body.updatedproduct.price,
      category: req.body.updatedproduct.category,
      description: req.body.updatedproduct.description,
      countInStock: req.body.updatedproduct.countInStock,
      image: req.body.updatedproduct.image,
    },
    (err) => {
      if (err) {
        return res.status(400).json({ message: "Something went wrong" + err });
      } else {
        res.send("Product Updated Successfully");
      }
    }
  );
});

module.exports = router;
