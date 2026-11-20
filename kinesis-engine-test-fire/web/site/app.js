fetch("./config.json")
  .then((response) => response.json())
  .then((config) => { window.ROCKET_API_URL = config.apiUrl || ""; })
  .catch(() => { window.ROCKET_API_URL = ""; })
  .finally(() => import("./src/main.jsx"));
