const config = require("./config");
const os = require("os");
const { authRouter } = require("./routes/authRouter");
const { orderRouter } = require("./routes/orderRouter");
const { franchiseRouter } = require("./routes/franchiseRouter");

const requests = {};

// Add a system metrics object to store the latest readings
const systemMetrics = {
  cpu: 0,
  memory: 0,
};

let lastCpuInfo = os.cpus();

// Add request tracking middleware
const requestTracker = (req, res, next) => {
  // Track method counts
  const method = req.method.toUpperCase();
  if (methodCounts.hasOwnProperty(method)) {
    incrementMethodCount(method);
    console.log(`Global request tracked: ${method} ${req.path}`);
  }

  // Track response completion
  res.on("finish", () => {
    console.log(`Request completed: ${method} ${req.path} ${res.statusCode}`);
  });

  next();
};

function track(endpoint) {
  return (req, res, next) => {
    // Only track endpoint-specific requests, method counting is now handled globally
    requests[endpoint] = (requests[endpoint] || 0) + 1;
    requests["total"] = (requests["total"] || 0) + 1;
    console.log(`Endpoint tracked: ${endpoint}, count: ${requests[endpoint]}`);
    next();
  };
}

const methodCounts = {
  GET: 0,
  POST: 0,
  PUT: 0,
  DELETE: 0,
};

function resetMethodCounts() {
  methodCounts.GET = 0;
  methodCounts.POST = 0;
  methodCounts.PUT = 0;
  methodCounts.DELETE = 0;
  console.log("Method counts reset:", methodCounts);
}

function getMethodCounts() {
  return { ...methodCounts }; // Return a copy to prevent direct modification
}

function incrementMethodCount(method) {
  if (methodCounts.hasOwnProperty(method)) {
    methodCounts[method]++;
    console.log(`Incremented ${method} count to ${methodCounts[method]}`);
  }
}

function getCpuUsagePercentage() {
  const currentCpuInfo = os.cpus();
  const currentTime = Date.now();

  let totalUsage = 0;

  currentCpuInfo.forEach((cpu, index) => {
    const prevCpu = lastCpuInfo[index];
    const prevTotal = Object.values(prevCpu.times).reduce((a, b) => a + b, 0);
    const currentTotal = Object.values(cpu.times).reduce((a, b) => a + b, 0);
    const prevIdle = prevCpu.times.idle;
    const currentIdle = cpu.times.idle;
    const totalDelta = currentTotal - prevTotal;
    const idleDelta = currentIdle - prevIdle;
    const cpuUsage = 100 * (1 - idleDelta / totalDelta);
    totalUsage += cpuUsage;
  });

  // Update last values for next calculation
  lastCpuInfo = currentCpuInfo;
  lastCpuInfoTime = currentTime;

  return Math.round(totalUsage / currentCpuInfo.length);
}

function getMemoryUsagePercentage() {
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const usedMemory = totalMemory - freeMemory;
  const memoryUsage = (usedMemory / totalMemory) * 100;
  return Math.round(memoryUsage);
}

// Function to collect and send system metrics
function startSystemMetricsCollection(interval = 10000) {
  // Reset counts every 60 seconds
  setInterval(resetMethodCounts, 60000);

  setInterval(() => {
    try {
      // Update current metrics
      systemMetrics.cpu = getCpuUsagePercentage();
      systemMetrics.memory = getMemoryUsagePercentage();

      // Send CPU metric
      sendMetricToGrafana("system_cpu_usage", systemMetrics.cpu, {
        unit: "percentage",
        type: "system",
      });

      // Send Memory metric
      sendMetricToGrafana("system_memory_usage", systemMetrics.memory, {
        unit: "percentage",
        type: "system",
      });

      // Send method-specific metrics with current counts
      const currentCounts = getMethodCounts();
      Object.entries(currentCounts).forEach(([method, count]) => {
        console.log(`Sending ${method} count:`, count);
        sendMetricToGrafana("http_method_requests", count, {
          method: method,
          type: "method",
        });
      });
      resetMethodCounts();

      // Try to get endpoints safely
      let endpoints = {};
      try {
        endpoints = {
          auth: authRouter?.endpoints?.length || 0,
          order: orderRouter?.endpoints?.length || 0,
          franchise: franchiseRouter?.endpoints?.length || 0,
        };
      } catch (err) {
        console.log("Note: Some routers not initialized yet");
      }

      // Send endpoint metrics only if we have data
      Object.entries(endpoints).forEach(([router, count]) => {
        if (count > 0) {
          sendMetricToGrafana("available_endpoints", count, {
            router,
            type: "endpoint",
          });
        }
      });

      // Send request metrics
      Object.entries(requests).forEach(([endpoint, count]) => {
        sendMetricToGrafana("http_requests", count, {
          endpoint,
          type: "request",
        });
      });
    } catch (error) {
      console.error("Error collecting metrics:", error.message);
    }
  }, interval);
}

function sendMetricToGrafana(metricName, metricValue, attributes) {
  const intValue = Math.round(Number(metricValue));

  attributes = { ...attributes, source: config.metrics.source };

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
                      asInt: intValue,
                      timeUnixNano: Date.now() * 1000000,
                      attributes: [],
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

  Object.keys(attributes).forEach((key) => {
    metric.resourceMetrics[0].scopeMetrics[0].metrics[0].sum.dataPoints[0].attributes.push(
      {
        key: key,
        value: { stringValue: String(attributes[key]) },
      }
    );
  });

  fetch(`${config.metrics.url}`, {
    method: "POST",
    body: JSON.stringify(metric),
    headers: {
      Authorization: `Bearer ${config.metrics.apiKey}`,
      "Content-Type": "application/json",
    },
  })
    .then((response) => {
      if (!response.ok) {
        console.error(
          `Failed to push metrics data to Grafana for ${metricName}`
        );
      } else {
        console.log(
          `Successfully pushed ${metricName} with value ${metricValue}`
        );
      }
    })
    .catch((error) => {
      console.error(`Error pushing metrics for ${metricName}:`, error);
    });
}

// Update exports to include new functionality
module.exports = {
  track,
  startSystemMetricsCollection,
  getSystemMetrics: () => ({ ...systemMetrics }),
  getMethodCounts,
  incrementMethodCount,
  requestTracker, // Export the new middleware
};
