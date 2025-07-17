const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { app } = require("electron");

class DatabaseManager {
  constructor() {
    this.db = null;
    this.initDatabase();
  }

  initDatabase() {
    try {
      console.log("🔄 Starting database initialization...");

      const dbFileName =
        process.env.NODE_ENV === "development"
          ? "transcriptions-dev.db"
          : "transcriptions.db";

      const dbPath = path.join(app.getPath("userData"), dbFileName);
      console.log("📁 Database path:", dbPath);

      console.log("🔧 Creating database connection...");
      this.db = new Database(dbPath);
      console.log("✅ Database connection created");

      console.log("📋 Creating transcriptions table...");
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS transcriptions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          text TEXT NOT NULL,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
      console.log("✅ Transcriptions table created/verified");

      console.log("📊 Counting existing transcriptions...");
      const countStmt = this.db.prepare(
        "SELECT COUNT(*) as count FROM transcriptions"
      );
      const { count } = countStmt.get();

      console.log(
        `✅ Database initialized successfully (${count} existing transcriptions)`
      );
      return true;
    } catch (error) {
      console.error("❌ Database initialization failed:", error);
      console.error("Error details:", {
        message: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }

  saveTranscription(text) {
    try {
      if (!this.db) {
        throw new Error("Database not initialized");
      }
      const stmt = this.db.prepare(
        "INSERT INTO transcriptions (text) VALUES (?)"
      );
      const result = stmt.run(text);

      const truncatedText =
        text.length > 50 ? text.substring(0, 50) + "..." : text;
      console.log(
        `📝 Transcription saved to ${process.env.NODE_ENV || "production"} DB:`,
        {
          id: result.lastInsertRowid,
          text: truncatedText,
          length: text.length,
        }
      );

      return { id: result.lastInsertRowid, success: true };
    } catch (error) {
      console.error("❌ Error saving transcription:", error);
      throw error;
    }
  }

  getTranscriptions(limit = 50) {
    try {
      if (!this.db) {
        throw new Error("Database not initialized");
      }
      const stmt = this.db.prepare(
        "SELECT * FROM transcriptions ORDER BY timestamp DESC LIMIT ?"
      );
      const transcriptions = stmt.all(limit);
      console.log(
        `📚 Retrieved ${transcriptions.length} transcriptions from ${
          process.env.NODE_ENV || "production"
        } DB (limit: ${limit})`
      );
      return transcriptions;
    } catch (error) {
      console.error("❌ Error getting transcriptions:", error);
      throw error;
    }
  }

  clearTranscriptions() {
    try {
      if (!this.db) {
        throw new Error("Database not initialized");
      }
      const stmt = this.db.prepare("DELETE FROM transcriptions");
      const result = stmt.run();
      console.log(
        `🗑️ Cleared ${result.changes} transcriptions from ${
          process.env.NODE_ENV || "production"
        } DB`
      );
      return { cleared: result.changes, success: true };
    } catch (error) {
      console.error("❌ Error clearing transcriptions:", error);
      throw error;
    }
  }

  deleteTranscription(id) {
    try {
      if (!this.db) {
        throw new Error("Database not initialized");
      }
      const stmt = this.db.prepare("DELETE FROM transcriptions WHERE id = ?");
      const result = stmt.run(id);
      console.log(
        `🗑️ Deleted transcription ${id}, affected rows: ${result.changes}`
      );
      return { success: result.changes > 0 };
    } catch (error) {
      console.error("❌ Error deleting transcription:", error);
      throw error;
    }
  }

  cleanup() {
    console.log("Starting database cleanup...");
    try {
      const dbPath = path.join(
        app.getPath("userData"),
        process.env.NODE_ENV === "development"
          ? "transcriptions-dev.db"
          : "transcriptions.db"
      );
      if (fs.existsSync(dbPath)) {
        fs.unlinkSync(dbPath);
        console.log("✅ Database file deleted:", dbPath);
      }
    } catch (error) {
      console.error("❌ Error deleting database file:", error);
    }
  }
}

module.exports = DatabaseManager;
