// scripts/dropPruPaymentReferenceIndex.js
const mongoose = require("mongoose");

async function run() {
  await mongoose.connect(process.env.MONGODB_URI); // your URI

  const col = mongoose.connection.db.collection("prupayments");
  const indexes = await col.indexes();
  console.log("Current indexes:", indexes.map((i) => i.name));

  try {
    await col.dropIndex("reference_1");
    console.log("✅ Dropped reference_1");
  } catch (e) {
    console.log("reference_1 not found or already dropped:", e.message);
  }

  // ensure compound index exists
  await col.createIndex(
    { reference: 1, user: 1, role: 1 },
    { unique: true, name: "reference_1_user_1_role_1" }
  );
  console.log("✅ Compound unique index ready");

  await mongoose.disconnect();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});