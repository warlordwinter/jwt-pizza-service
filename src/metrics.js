const config = require("./config");
const os = require("os");

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

  // Track endpoint-specific requests
  const endpoint = req.path.split("/")[2]; // Gets 'auth', 'order', or 'franchise' from /api/[endpoint]
  if (endpoint) {
    requests[endpoint] = (requests[endpoint] || 0) + 1;
    requests["total"] = (requests["total"] || 0) + 1;
    console.log(`Endpoint tracked: ${endpoint}, count: ${requests[endpoint]}`);
  }

  // Track response completion
  res.on("finish", () => {
    console.log(`Request completed: ${method} ${req.path} ${res.statusCode}`);
  });

  next();
};

// Track available endpoints
let availableEndpoints = {};

function updateAvailableEndpoints(router, count) {
  availableEndpoints[router] = count;
}

// Remove the separate track function since it's now handled in requestTracker
function track(endpoint) {
  return (req, res, next) => next();
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

const authenticationCounts = {
  success: 0,
  failure: 0,
  total: 0,
};

function incrementAuthenticationCount(success) {
  authenticationCounts.total++;
  if (success) {
    authenticationCounts.success++;
    console.log(
      `Authentication success. Total successes: ${authenticationCounts.success}`
    );
  } else {
    authenticationCounts.failure++;
    console.log(
      `Authentication failure. Total failures: ${authenticationCounts.failure}`
    );
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

const revenueMetrics = {
  totalRevenue: 0,
};

function trackRevenue(items) {
  console.log("Tracking revenue for items:", JSON.stringify(items, null, 2));

  if (!items || !Array.isArray(items)) {
    console.error("Invalid items array passed to trackRevenue");
    return;
  }

  const orderRevenue = items.reduce((total, item) => {
    if (!item || typeof item.price !== "number") {
      console.error("Invalid item or price:", item);
      return total;
    }
    console.log(`Adding item price: ${item.price}`);
    return (total + item.price) * 100;
  }, 0);

  revenueMetrics.totalRevenue += orderRevenue;
  console.log(
    `Order revenue: ${orderRevenue}, New total revenue: ${revenueMetrics.totalRevenue}`
  );
}

function getMemoryUsagePercentage() {
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const usedMemory = totalMemory - freeMemory;
  const memoryUsage = (usedMemory / totalMemory) * 100;
  return Math.round(memoryUsage);
}

// Add active users tracking
const userMetrics = {
  activeUsers: new Set(), // Using Set to prevent duplicate counting
  totalActiveCount: 0,
};

function trackUserActivity(userId, isActive) {
  if (isActive) {
    userMetrics.activeUsers.add(userId);
  } else {
    userMetrics.activeUsers.delete(userId);
  }
  userMetrics.totalActiveCount = userMetrics.activeUsers.size;
  console.log(`Active users count: ${userMetrics.totalActiveCount}`);
}

const pizzaOrderMetrics = {
  success: 0,
  failure: 0,
  total: 0,
};

function trackPizzaOrder(success) {
  pizzaOrderMetrics.total++;
  if (success) {
    pizzaOrderMetrics.success++;
    console.log(
      `Pizza order success. Total successful orders: ${pizzaOrderMetrics.success}`
    );
  } else {
    pizzaOrderMetrics.failure++;
    console.log(
      `Pizza order failure. Total failed orders: ${pizzaOrderMetrics.failure}`
    );
  }
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

      // Send revenue metrics
      sendMetricToGrafana(
        "pizza_service_revenue_total",
        revenueMetrics.totalRevenue,
        {
          type: "revenue",
        }
      );

      // Send pizza order metrics
      sendMetricToGrafana("pizza_orders_success", pizzaOrderMetrics.success, {
        type: "orders",
        status: "success",
      });

      sendMetricToGrafana("pizza_orders_failure", pizzaOrderMetrics.failure, {
        type: "orders",
        status: "failure",
      });

      sendMetricToGrafana("pizza_orders_total", pizzaOrderMetrics.total, {
        type: "orders",
        status: "total",
      });

      // Send active users metric
      sendMetricToGrafana("active_users", userMetrics.totalActiveCount, {
        type: "users",
      });

      // Send authentication metrics
      sendMetricToGrafana(
        "auth_attempts_success",
        authenticationCounts.success,
        {
          type: "auth",
          status: "success",
        }
      );

      sendMetricToGrafana(
        "auth_attempts_failure",
        authenticationCounts.failure,
        {
          type: "auth",
          status: "failure",
        }
      );

      sendMetricToGrafana("auth_attempts_total", authenticationCounts.total, {
        type: "auth",
        status: "total",
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

      // Send endpoint metrics
      Object.entries(availableEndpoints).forEach(([router, count]) => {
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
  console.log(
    `Preparing to send metric: ${metricName} with value: ${metricValue}`
  );

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

  console.log("Sending metric payload:", JSON.stringify(metric, null, 2));

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
          `Failed to push metrics data to Grafana for ${metricName}:`,
          response.status,
          response.statusText
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
  requestTracker,
  trackUserActivity,
  incrementAuthenticationCount,
  getUserMetrics: () => ({
    activeCount: userMetrics.totalActiveCount,
    activeUsers: Array.from(userMetrics.activeUsers),
  }),
  getAuthMetrics: () => ({ ...authenticationCounts }),
  updateAvailableEndpoints,
  trackRevenue,
  trackPizzaOrder,
  getPizzaOrderMetrics: () => ({ ...pizzaOrderMetrics }),
};
