import { ensureDatabase } from "../server/lib/database.js";

ensureDatabase()
  .then(() => {
    console.log("SQLite 数据库初始化完成。");
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
