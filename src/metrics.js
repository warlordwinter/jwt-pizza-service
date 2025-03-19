const config = require("./config");
const os = require("os");
const fetch = require("node-fetch"); // Add this if using Node.js < 18

const requests = {};

function getCpuUsagePercentage() {
  const cpuUsage = os.loadavg()[0] / os.cpus().length;
  return Number((cpuUsage * 100).toFixed(2)); // Ensure it's a number
}

function getMemoryUsagePercentage() {
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const usedMemory = totalMemory - freeMemory;
  return Number(((usedMemory / totalMemory) * 100).toFixed(2)); // Ensure it's a number
}

function sendMetricToGrafana(metricName, metricValue, attributes) {
  attributes = { ...attributes, source: config.source };

  const metric = {
    resourceMetrics: [
      {
        scopeMetrics: [
          {
            metrics: [
              {
                name: metricName,
                unit: "1",
                sum: {
                  dataPoints: [
                    {
                      asInt: metricValue,
                      timeUnixNano: Date.now() * 1_000_000, // Ensuring nanosecond timestamp
                      attributes: Object.keys(attributes).map((key) => ({
                        key: key,
                        value: { stringValue: attributes[key] },
                      })),
                    },
                  ],
                  aggregationTemporality: "AGGREGATION_TEMPORALITY_CUMULATIVE",
                  isMonotonic: true,
                },
              },
            ],
          },
        ],
      },
    ],
  };

  fetch(config.url, {
    method: "POST",
    body: JSON.stringify(metric),
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
  })
    .then((response) => {
      if (!response.ok) {
        console.error("Failed to push metrics data to Grafana");
      } else {
        console.log(`Pushed ${metricName}`);
      }
    })
    .catch((error) => {
      console.error("Error pushing metrics:", error);
    });
}

function track(endpoint) {
  return (req, res, next) => {
    requests[endpoint] = (requests[endpoint] || 0) + 1; // Increment per-endpoint count
    requests["total"] = (requests["total"] || 0) + 1; // Increment total request count
    next();
  };
}

// Periodically send metrics to Grafana
const timer = setInterval(() => {
  sendMetricToGrafana("memory_usage", getMemoryUsagePercentage(), {});
  sendMetricToGrafana("cpu_usage", getCpuUsagePercentage(), {});

  Object.keys(requests).forEach((endpoint) => {
    sendMetricToGrafana("requests", requests[endpoint], { endpoint });
  });
}, 10000);

module.exports = { track };
