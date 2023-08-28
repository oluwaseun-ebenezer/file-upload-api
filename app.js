const express = require("express");
const uploader = require("./uploader");
const app = express();

require("dotenv").config();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.post("/", async (req, res) => {
  try {
    const startTime = Date.now();
    const urls = await Promise.all(
      req.body.urls.map(async (url) => await uploader(url))
    );

    return res.send({
      status: "success",
      urls,
      execution_time: `${Date.now() - startTime} ms`,
    });
  } catch (error) {
    console.error("Error processing the request:", error);
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`listening on port ${port}`));

module.exports = app;
