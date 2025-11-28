const mongoose = require("mongoose");
var mongoURL =
  "mongodb+srv://Hariprakash:Hariprakash20@cluster0.3wyvyo5.mongodb.net/pixel-cms-ecommerce";

mongoose.connect(mongoURL, { useUnifiedTopology: true, useNewUrlParser: true });

var connection = mongoose.connection;

connection.on("error", () => {
  console.log("Mongo DB connection failed");
});

connection.on("connected", () => {
  console.log("Mongo DB connection successful");
});

module.exports = mongoose;
