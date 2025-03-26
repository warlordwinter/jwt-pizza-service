const fetch = require("node-fetch");

class Logger {
  httpLogger = (req, res, next) => {
    let send = res.send;
    res.send = (resBody) => {
      const logData = {
        authorized: !!req.headers.authorization,
        path: req.originalUrl,
        method: req.method,
        statusCode: res.statusCode,
        reqBody: JSON.stringify(req.body),
        resBody: JSON.stringify(resBody),
      };
      const level = this.statusToLogLevel(res.statusCode);
      this.log(level, "http", logData);
      res.send = send;
      return res.send(resBody);
    };
    next();
  };

  log(level, type, logData) {
    const labels = {
      component: "jwt-pizza-service",
      level: level,
      type: type,
      environment: process.env.NODE_ENV || "development",
    };
    const values = [this.nowString(), this.sanitize(logData)];
    const logEvent = { streams: [{ stream: labels, values: [values] }] };

    this.sendLogToGrafana(logEvent).catch((error) => {
      console.error("Failed to send log to Grafana:", error);
    });
  }

  statusToLogLevel(statusCode) {
    if (statusCode >= 500) return "error";
    if (statusCode >= 400) return "warn";
    return "info";
  }

  nowString() {
    return (Math.floor(Date.now()) * 1000000).toString();
  }

  sanitize(logData) {
    logData = JSON.stringify(logData);
    return logData.replace(
      /\\"password\\":\s*\\"[^"]*\\"/g,
      '\\"password\\": \\"*****\\"'
    );
  }

  async sendLogToGrafana(event) {
    try {
      const body = JSON.stringify(event);
      const response = await fetch(process.env.LOGGING_URL, {
        method: "post",
        body: body,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.LOGGING_USER_ID}:${process.env.LOGGING_API_KEY}`,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
    } catch (error) {
      console.error("Failed to send log to Grafana:", error);
      throw error;
    }
  }
}
module.exports = new Logger();
