let appPromise;

export default async function handler(req, res) {
  if (!appPromise) {
    appPromise = import("../backend/index.js");
  }
  const { default: app } = await appPromise;
  req.url = String(req.url || "").replace(/^\/api/, "") || "/";
  return app(req, res);
}
