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
  if (Object.prototype.hasOwnProperty.call(methodCounts, method)) {
    incrementMethodCount(method);
  }

  // Track endpoint-specific requests
  const endpointPath = req.path.split("/")[2]; // Gets 'auth', 'order', or 'franchise' from /api/[endpoint]
  if (endpointPath) {
    requests[endpointPath] = (requests[endpointPath] || 0) + 1;
    requests["total"] = (requests["total"] || 0) + 1;
  }

  // Track response completion
  res.on("finish", () => {
    // console.log(`Request completed: ${method} ${req.path} ${res.statusCode}`);
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
  // console.log("Method counts reset:", methodCounts);
}

function getMethodCounts() {
  return { ...methodCounts }; // Return a copy to prevent direct modification
}

function incrementMethodCount(method) {
  if (Object.prototype.hasOwnProperty.call(methodCounts, method)) {
    methodCounts[method]++;
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
    // console.log(
    //   `Authentication success. Total successes: ${authenticationCounts.success}`
    // );
  } else {
    authenticationCounts.failure++;
    // console.log(
    //   `Authentication failure. Total failures: ${authenticationCounts.failure}`
    // );
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

  return Math.round(totalUsage / currentCpuInfo.length);
}

const revenueMetrics = {
  totalRevenue: 0,
};

function trackRevenue(items) {
  if (!items || !Array.isArray(items)) {
    // console.error("Invalid items array passed to trackRevenue");
    return;
  }

  const orderRevenue = items.reduce((total, item) => {
    if (!item || typeof item.price !== "number") {
      // console.error("Invalid item or price:", item);
      return total;
    }
    return (total + item.price) * 100;
  }, 0);

  revenueMetrics.totalRevenue += orderRevenue;
  // console.log(
  //   `Order revenue: ${orderRevenue}, New total revenue: ${revenueMetrics.totalRevenue}`
  // );
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
  // console.log(`Active users count: ${userMetrics.totalActiveCount}`);
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
    // console.log(
    //   `Pizza order success. Total successful orders: ${pizzaOrderMetrics.success}`
    // );
  } else {
    pizzaOrderMetrics.failure++;
    // console.log(
    //   `Pizza order failure. Total failed orders: ${pizzaOrderMetrics.failure}`
    // );
  }
}

// Add after pizzaOrderMetrics
const pizzaMetrics = {
  totalPizzasSold: 0,
  pizzaCreationFailures: 0,
  pizzasByType: {}, // Track count by pizza type
};

function trackPizzaSales(items, success) {
  if (!items || !Array.isArray(items)) {
    // console.error("Invalid items array passed to trackPizzaSales");
    return;
  }

  const pizzaCount = items.length;

  if (success) {
    pizzaMetrics.totalPizzasSold += pizzaCount;
    // Track by pizza type
    items.forEach((item) => {
      if (item.description) {
        pizzaMetrics.pizzasByType[item.description] =
          (pizzaMetrics.pizzasByType[item.description] || 0) + 1;
      }
    });
  } else {
    pizzaMetrics.pizzaCreationFailures += pizzaCount;
    // console.log(`Failed to create ${pizzaCount} pizzas`);
  }
}

const pizzaCreationLatency = {
  average: 0,
  count: 0,
};

function trackPizzaCreationLatency(startTime, endTime) {
  const latency = endTime - startTime;
  pizzaCreationLatency.count++;
  pizzaCreationLatency.average = Math.round(
    (pizzaCreationLatency.average * (pizzaCreationLatency.count - 1) +
      latency) /
      pizzaCreationLatency.count
  );
  // console.log(
  //   `Pizza creation latency: ${latency}ms, Average: ${pizzaCreationLatency.average}ms`
  // );
}

const serviceLatency = {
  average: 0,
  count: 0,
};

function trackServiceLatency(startTime, endTime) {
  const latency = endTime - startTime;
  serviceLatency.count++;
  serviceLatency.average = Math.round(
    (serviceLatency.average * (serviceLatency.count - 1) + latency) /
      serviceLatency.count
  );
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

      // Send service latency metrics
      sendMetricToGrafana("API_Latency", serviceLatency.average, {
        type: "latency",
        unit: "milliseconds",
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

      // Send pizza creation latency
      sendMetricToGrafana(
        "pizza_creation_latency_ms",
        pizzaCreationLatency.average,
        {
          type: "latency",
          unit: "milliseconds",
        }
      );

      // Send pizza order metrics
      sendMetricToGrafana("pizza_orders_success", pizzaOrderMetrics.success, {
        type: "orders",
        status: "success",
      });

      // Send pizza sales metrics
      sendMetricToGrafana("pizzas_sold_total", pizzaMetrics.totalPizzasSold, {
        type: "sales",
        metric: "total_pizzas",
      });

      sendMetricToGrafana(
        "pizzas_creation_failures",
        pizzaMetrics.pizzaCreationFailures,
        {
          type: "sales",
          metric: "creation_failures",
        }
      );

      // Send metrics for each pizza type
      Object.entries(pizzaMetrics.pizzasByType).forEach(
        ([pizzaType, count]) => {
          sendMetricToGrafana("pizzas_sold_by_type", count, {
            type: "sales",
            pizza_type: pizzaType,
          });
        }
      );

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
        // console.log(`Sending ${method} count:`, count);
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
      // console.error("Error collecting metrics:", error.message);
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
        // console.error(
        //   `Failed to push metrics data to Grafana for ${metricName}:`,
        //   response.status,
        //   response.statusText
        // );
      } else {
        // console.log(
        //   `Successfully pushed ${metricName} with value ${metricValue}`
        // );
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
  trackPizzaSales,
  getPizzaMetrics: () => ({
    totalSold: pizzaMetrics.totalPizzasSold,
    creationFailures: pizzaMetrics.pizzaCreationFailures,
    byType: { ...pizzaMetrics.pizzasByType },
  }),
  trackPizzaCreationLatency,
  trackServiceLatency,
};
