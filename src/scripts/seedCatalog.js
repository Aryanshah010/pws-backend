require("dotenv").config({
  path: require("path").join(__dirname, "../../.env"),
});

const mongoose = require("mongoose");
const Product = require("../models/Product");

const products = [
  {
    name: "Mustard Oil 1L",
    nameNe: "तोरीको तेल १ लिटर",
    aliases: ["Tori Tel", "Tori ko Tel", "तोरी तेल", "Mustard Oil"],
    category: "Oil",
    unit: "1L PET Bottle",
    retailPrice: 160,
    stock: 240,
    imageUrl: "/products/oil.svg",
    description:
      "Pure cold-pressed mustard oil with a rich aroma for everyday Nepali cooking.",
    descriptionNe: "दैनिक नेपाली खानाका लागि शुद्ध कोल्ड प्रेस्ड तोरीको तेल।",
    grade: "A",
    packCount: "1 bottle",
    shelfLife: "12 Months",
    origin: "Terai, Nepal",
    tierPrices: [
      { minQuantity: 10, price: 150 },
      { minQuantity: 50, price: 145 },
    ],
  },
  {
    name: "Mustard Oil 5L",
    nameNe: "तोरीको तेल ५ लिटर",
    aliases: ["Tori Tel 5L", "तोरी तेल", "Mustard Oil"],
    category: "Oil",
    unit: "5L HDPE Jar",
    retailPrice: 760,
    stock: 80,
    imageUrl: "/products/oil.svg",
    description:
      "Economy five-litre mustard oil pack for households and bulk buyers.",
    grade: "A",
    packCount: "1 jar",
    shelfLife: "12 Months",
    origin: "Terai, Nepal",
    tierPrices: [
      { minQuantity: 10, price: 730 },
      { minQuantity: 50, price: 700 },
    ],
  },
  {
    name: "Basmati Rice 25kg",
    nameNe: "बासमती चामल २५ केजी",
    aliases: ["Chamāl", "Chamal", "चामल", "Basmati"],
    category: "Rice",
    unit: "25kg Bag",
    retailPrice: 2350,
    stock: 12,
    imageUrl: "/products/rice.svg",
    description:
      "Long-grain aromatic basmati rice, milled fresh for soft everyday meals.",
    grade: "Premium",
    packCount: "1 bag",
    shelfLife: "18 Months",
    origin: "Terai, Nepal",
    tierPrices: [
      { minQuantity: 10, price: 2250 },
      { minQuantity: 50, price: 2150 },
    ],
  },
  {
    name: "Toor Dal 1kg",
    nameNe: "रहर दाल १ केजी",
    aliases: ["Rahar Dal", "Dal", "दाल", "Toor Dal"],
    category: "Dal",
    unit: "1kg Packet",
    retailPrice: 210,
    stock: 65,
    imageUrl: "/products/dal.svg",
    description: "Clean, protein-rich toor dal for daily meals.",
    grade: "A",
    packCount: "1 packet",
    shelfLife: "12 Months",
    origin: "Nepal",
    tierPrices: [
      { minQuantity: 10, price: 198 },
      { minQuantity: 50, price: 188 },
    ],
  },
  {
    name: "Whole Wheat Flour 2kg",
    nameNe: "गहुँको आटा २ केजी",
    aliases: ["Aata", "Atta", "आटा", "Flour"],
    category: "Flour",
    unit: "2kg Bag",
    retailPrice: 190,
    stock: 0,
    imageUrl: "/products/flour.svg",
    description: "Stone-ground whole wheat flour for soft rotis and breads.",
    grade: "Standard",
    packCount: "1 bag",
    shelfLife: "6 Months",
    origin: "Nepal",
    tierPrices: [
      { minQuantity: 10, price: 180 },
      { minQuantity: 50, price: 172 },
    ],
  },
  {
    name: "Sunflower Oil 1L",
    nameNe: "सनफ्लावर तेल १ लिटर",
    aliases: ["Sunflower Tel", "Sunflower Oil", "तेल"],
    category: "Oil",
    unit: "1L PET Bottle",
    retailPrice: 225,
    stock: 40,
    imageUrl: "/products/oil.svg",
    description:
      "Light, refined sunflower oil for everyday frying and cooking.",
    grade: "A",
    packCount: "1 bottle",
    shelfLife: "12 Months",
    origin: "Nepal",
    tierPrices: [
      { minQuantity: 10, price: 212 },
      { minQuantity: 50, price: 200 },
    ],
  },
  {
    name: "Laundry Soap Bar",
    nameNe: "लुगा धुने साबुन",
    aliases: ["Sabun", "साबुन", "Laundry Soap"],
    category: "Soap",
    unit: "250g Bar",
    retailPrice: 55,
    stock: 120,
    imageUrl: "/products/rawfood.jpg",
    description: "Tough-on-stains laundry soap bar for home use.",
    grade: "Standard",
    packCount: "1 bar",
    shelfLife: "24 Months",
    origin: "Nepal",
    tierPrices: [
      { minQuantity: 10, price: 50 },
      { minQuantity: 50, price: 47 },
    ],
  },
  {
    name: "Iodized Salt 1kg",
    nameNe: "आयोडिन नुन १ केजी",
    aliases: ["Nuun", "Nuun", "नुन", "Salt"],
    category: "Essentials",
    unit: "1kg Packet",
    retailPrice: 32,
    stock: 200,
    imageUrl: "/products/rawfood.jpg",
    description: "Fine iodized salt for balanced everyday cooking.",
    grade: "Standard",
    packCount: "1 packet",
    shelfLife: "24 Months",
    origin: "Nepal",
    tierPrices: [
      { minQuantity: 10, price: 30 },
      { minQuantity: 50, price: 28 },
    ],
  },
];

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI);
  let inserted = 0;
  for (const item of products) {
    const existing = await Product.findOne({ name: item.name });
    if (!existing) {
      await Product.create({
        ...item,
        priceHistory: [
          {
            price: Math.round(item.retailPrice * 1.05),
            date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          },
        ],
      });
      inserted += 1;
    } else if (existing.priceHistory.length < 2) {
      existing.priceHistory.unshift({
        price: Math.round(existing.retailPrice * 1.05),
        date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      });
      await existing.save();
    }
  }
  console.log(
    `Catalogue seed complete: ${inserted} product(s) added, ${products.length - inserted} retained.`,
  );
  await mongoose.disconnect();
}

seed().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect();
  process.exit(1);
});
