import fs from "fs";
import path from "path";

const contentDir = path.join(process.cwd(), "content");
let memberSeoCache;

export function getPersonContent(person, file) {
  const filePath = path.join(contentDir, person, `${file}.json`);
  const raw = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(raw);
}

export function getValidPersons() {
  return fs
    .readdirSync(contentDir)
    .filter((entry) =>
      fs.statSync(path.join(contentDir, entry)).isDirectory()
    );
}

export function getPortfolioPersons() {
  const orderPath = path.join(contentDir, "portfolio-order.json");
  const order = JSON.parse(fs.readFileSync(orderPath, "utf-8"));
  const validPersons = new Set(getValidPersons());

  return order.filter((person) => validPersons.has(person));
}

export function getMemberSeo(person) {
  if (!memberSeoCache) {
    const seoPath = path.join(contentDir, "member-seo.json");
    memberSeoCache = JSON.parse(fs.readFileSync(seoPath, "utf-8"));
  }

  return memberSeoCache[person] || {};
}
