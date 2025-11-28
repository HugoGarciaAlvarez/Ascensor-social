import express from 'express';
import cors from 'cors';
import fs from 'fs';
import csv from 'csv-parser';
import path from 'path';
import { fileURLToPath } from 'url';

const app = express();
app.use(cors());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const allowedCSVs = [
  "centiles-padres",
  "centiles-hijos",
  "distribucion-quintiles",
  "movilidad-nacional",
  "ranking-ccaa"
];

// Función para limpiar cada campo
function limpiar(str) {
  if (!str) return "";
  return str
    .trim()
    .replace(/Ã±/g, "ñ")
    .replace(/Ã¡/g, "á")
    .replace(/Ã©/g, "é")
    .replace(/Ã³/g, "ó")
    .replace(/Ãº/g, "ú")
    .replace(/Ã/g, "í") // Ajustar según CSV
    .replace(/\s+/g, " "); // Quita espacios extra dentro de la cadena
}

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

// Endpoint para leer CSV
app.get("/api/csv/:name", (req, res) => {
  const { name } = req.params;

  if (!allowedCSVs.includes(name)) {
    return res.status(404).json({ error: "CSV no permitido" });
  }

  const filePath = path.join(__dirname, "data", `${name}.csv`);
  const results = [];

  fs.createReadStream(filePath)
    .pipe(csv())
    .on("data", (data) => {
      const cleanedData = {};
      for (const key in data) {
        const cleanedKey = limpiar(key);
        const cleanedValue = limpiar(data[key]);
        cleanedData[cleanedKey] = cleanedValue;
      }
      results.push(cleanedData);
    })
    .on("end", () => {
      res.json(results);
    })
    .on("error", (err) => {
      console.error(err);
      res.status(500).json({ error: "Error leyendo CSV" });
    });
});

const PORT = process.env.PORT || 5174;
app.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`);
});
