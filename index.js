const express = require("express");
const bodyParser = require("body-parser");
const app = express();
var dbconnection = require("./db");
// Products managed in CMS, but reviews stored in MongoDB
var productsRoute = require("./routes/productsRoute");
var userRoute = require("./routes/userRoute");
var orderRoute = require("./routes/orderRoute");
const cors = require("cors");
app.use(
  cors({
    orgin: "*",
  })
);
app.use(bodyParser.json());
const path = require("path");
app.use("/api/products", productsRoute); // Reviews endpoints
app.use("/api/users", userRoute);
app.use("/api/orders", orderRoute);

app.get("/", (req, res) => res.send(`Server Running successfully.....!`));

const port = process.env.PORT || 5001;

app.listen(port, () => console.log(`Node JS Server Started`));
