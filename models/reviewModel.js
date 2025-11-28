const mongoose = require("mongoose");

const reviewSchema = mongoose.Schema(
  {
    productid: {
      type: String,
      required: true,
    },
    userid: {
      type: String,
      required: true,
    },
    name: {
      type: String,
      required: true,
    },
    comment: {
      type: String,
      required: true,
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
  },
  {
    timestamps: true,
  }
);

const Review = mongoose.model("reviews", reviewSchema);

module.exports = Review;
