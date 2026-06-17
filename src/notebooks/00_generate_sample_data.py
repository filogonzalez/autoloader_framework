# Databricks notebook source
# MAGIC %md
# MAGIC # Generate Sample Source Data
# MAGIC
# MAGIC Writes one batch of realistic retail files into the landing volume
# MAGIC `autoloader_demo.landing.raw`, one folder per source. Re-running clears and
# MAGIC regenerates the files (Auto Loader checkpoints still guarantee exactly-once on
# MAGIC the ingestion side).
# MAGIC
# MAGIC Run `01_setup_metadata.sql` first so the catalog, schemas and volumes exist.

# COMMAND ----------

import json
import os
import shutil

from pyspark.sql import Row

RAW = "/Volumes/autoloader_demo/landing/raw"


def reset_dir(path: str):
    if os.path.exists(path):
        shutil.rmtree(path)
    os.makedirs(path, exist_ok=True)


def write_text(path: str, content: str):
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)


# COMMAND ----------

# MAGIC %md ## 1) POS transactions — Parquet (append, partitioned by load_date)

# COMMAND ----------

pos_dir = f"{RAW}/pos/transactions"
reset_dir(pos_dir)

pos_rows = [
    Row(transaction_id=f"T{1000 + i}", store_id=f"S{(i % 3) + 1:02d}", sku=f"SKU{i % 5:03d}",
        qty=(i % 4) + 1, amount=round(5.0 + i * 1.25, 2), load_date="2026-06-01")
    for i in range(20)
]
spark.createDataFrame(pos_rows).coalesce(1).write.mode("overwrite").parquet(pos_dir)
print(f"POS parquet -> {pos_dir}")

# COMMAND ----------

# MAGIC %md ## 2) Supplier ACME — headerless, pipe-delimited CSV (explicit schema)

# COMMAND ----------

acme_dir = f"{RAW}/suppliers/acme"
reset_dir(acme_dir)

acme_lines = [
    "ACME|SKU001|Olive Oil 1L|120|4.50|2026-06-01",
    "ACME|SKU002|Sea Salt 500g|80|1.20|2026-06-01",
    "ACME|SKU003|Pasta 1kg|NULL|0.95|2026-06-01",   # NULL token -> rendered as null
    "ACME|SKU004|Tomato Passata|240|0.80|2026-06-01",
]
write_text(f"{acme_dir}/acme_inventory_20260601.csv", "\n".join(acme_lines) + "\n")
print(f"ACME headerless CSV -> {acme_dir}")

# COMMAND ----------

# MAGIC %md ## 3) CRM customers — multiline JSON arrays (merge on customer_id)

# COMMAND ----------

crm_dir = f"{RAW}/crm/customers"
reset_dir(crm_dir)

crm_batch_1 = [
    {"customer_id": "C001", "name": "Ada Lovelace", "email": "ada@example.com", "segment": "premium"},
    {"customer_id": "C002", "name": "Alan Turing", "email": "alan@example.com", "segment": "standard"},
]
# Second file resends C002 (updated) + a new customer C003 -> exercises the upsert.
crm_batch_2 = [
    {"customer_id": "C002", "name": "Alan M. Turing", "email": "alan.turing@example.com", "segment": "premium"},
    {"customer_id": "C003", "name": "Grace Hopper", "email": "grace@example.com", "segment": "premium"},
]
write_text(f"{crm_dir}/customers_001.json", json.dumps(crm_batch_1, indent=2))
write_text(f"{crm_dir}/customers_002.json", json.dumps(crm_batch_2, indent=2))
print(f"CRM JSON -> {crm_dir}")

# COMMAND ----------

# MAGIC %md ## 4) Supplier EDI — XML (rowTag=Order)

# COMMAND ----------

edi_dir = f"{RAW}/suppliers/edi"
reset_dir(edi_dir)

edi_xml = """<?xml version="1.0" encoding="UTF-8"?>
<Orders>
  <Order id="PO-5001">
    <supplier>GlobalFoods</supplier>
    <sku>SKU010</sku>
    <quantity>500</quantity>
    <delivery_date>2026-06-10</delivery_date>
  </Order>
  <Order id="PO-5002">
    <supplier>GlobalFoods</supplier>
    <sku>SKU011</sku>
    <quantity>250</quantity>
    <delivery_date>2026-06-11</delivery_date>
  </Order>
</Orders>
"""
write_text(f"{edi_dir}/edi_orders_20260601.xml", edi_xml)
print(f"EDI XML -> {edi_dir}")

# COMMAND ----------

# MAGIC %md ## 5) Clickstream — JSONL with a top-level events[] array (explode_key=events)

# COMMAND ----------

click_dir = f"{RAW}/clickstream/events"
reset_dir(click_dir)

click_lines = [
    json.dumps({"export_id": "EXP1", "events": [
        {"event_id": "e1", "user": "C001", "type": "page_view", "ts": "2026-06-01T10:00:00Z"},
        {"event_id": "e2", "user": "C001", "type": "add_to_cart", "ts": "2026-06-01T10:01:00Z"},
    ]}),
    json.dumps({"export_id": "EXP2", "events": [
        {"event_id": "e3", "user": "C002", "type": "page_view", "ts": "2026-06-01T11:00:00Z"},
    ]}),
]
write_text(f"{click_dir}/clickstream_20260601.jsonl", "\n".join(click_lines) + "\n")
print(f"Clickstream JSONL -> {click_dir}")

# COMMAND ----------

# MAGIC %md ## 6) Loyalty history — CSV with multi-year schema drift (cast_all_as_string)
# MAGIC `customer_tier` is numeric in 2018 and a string in 2024. With `cast_all_as_string`
# MAGIC both files land without a type conflict — the Sunday-morning incident, prevented.

# COMMAND ----------

loyalty_dir = f"{RAW}/crm/loyalty_history"
reset_dir(loyalty_dir)

loyalty_2018 = "customer_id,customer_tier,points,updated_at\nC001,1,150,2018-03-01\nC002,2,420,2018-03-01\n"
loyalty_2024 = "customer_id,customer_tier,points,updated_at\nC001,Bronze,1500,2024-09-01\nC003,Gold,9800,2024-09-01\n"
write_text(f"{loyalty_dir}/loyalty_2018.csv", loyalty_2018)
write_text(f"{loyalty_dir}/loyalty_2024.csv", loyalty_2024)
print(f"Loyalty history CSV -> {loyalty_dir}")

# COMMAND ----------

# MAGIC %md ## 7) Product catalog — header CSV full snapshot (overwrite)

# COMMAND ----------

product_catalog_dir = f"{RAW}/product_catalog"
reset_dir(product_catalog_dir)

product_catalog_csv = """product_id,product_name,category,unit_price,in_stock,updated_date
P001,Organic Bananas,Produce,1.29,true,2026-06-01
P002,Whole Milk 1 Gallon,Dairy,4.19,true,2026-06-01
P003,Sourdough Bread,Bakery,5.49,true,2026-06-01
P004,Free Range Eggs,Dairy,6.99,true,2026-06-01
P005,Ground Coffee 12oz,Beverages,9.99,true,2026-06-01
P006,Almond Butter,Pantry,8.79,false,2026-06-01
P007,Tomato Basil Pasta Sauce,Pantry,3.49,true,2026-06-01
P008,Chicken Breast,Meat,7.99,true,2026-06-01
P009,Frozen Blueberries,Frozen,4.99,true,2026-06-01
P010,Sparkling Water 12 Pack,Beverages,6.49,true,2026-06-01
P011,Baby Spinach,Produce,3.99,true,2026-06-01
P012,Dark Chocolate Bar,Snacks,2.79,false,2026-06-01
"""
write_text(f"{product_catalog_dir}/product_catalog_20260601.csv", product_catalog_csv)
print(f"Product catalog header CSV -> {product_catalog_dir}")

# COMMAND ----------

# MAGIC %md ## 8) Store locations — header CSV append reference feed

# COMMAND ----------

def generate_store_locations():
    store_locations_dir = f"{RAW}/store_locations"
    reset_dir(store_locations_dir)

    store_locations_csv = """store_id,store_name,city,region,country,opened_date
S001,Maple Market Toronto,Toronto,Ontario,Canada,2018-04-12
S002,Granville Fresh Vancouver,Vancouver,British Columbia,Canada,2019-07-23
S003,Old Port Grocery Montreal,Montreal,Quebec,Canada,2020-02-14
S004,Exchange District Foods,Winnipeg,Manitoba,Canada,2021-05-03
S005,South Congress Market,Austin,Texas,United States,2022-09-18
S006,Capitol Hill Grocer,Seattle,Washington,United States,2017-11-06
S007,River North Pantry,Chicago,Illinois,United States,2016-03-29
S008,Back Bay Market,Boston,Massachusetts,United States,2023-01-15
S009,Pearl District Foods,Portland,Oregon,United States,2024-06-10
S010,Coconut Grove Grocer,Miami,Florida,United States,2025-08-21
"""
    write_text(f"{store_locations_dir}/store_locations_20260601.csv", store_locations_csv)
    print(f"Store locations header CSV -> {store_locations_dir}")


generate_store_locations()

# COMMAND ----------

print("Sample data generation complete.")
display(dbutils.fs.ls(RAW))
