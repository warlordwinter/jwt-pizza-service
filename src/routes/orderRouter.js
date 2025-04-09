const express = require("express");
const config = require("../config.js");
const { Role, DB } = require("../database/database.js");
const { authRouter } = require("./authRouter.js");
const { asyncHandler, StatusCodeError } = require("../endpointHelper.js");
const {
  trackRevenue,
  trackPizzaOrder,
  trackPizzaSales,
  trackPizzaCreationLatency,
  trackServiceLatency,
} = require("../metrics.js");
const Logger = require("../logger.js");

const orderRouter = express.Router();
const logger = new Logger(config);

orderRouter.endpoints = [
  {
    method: "GET",
    path: "/api/order/menu",
    description: "Get the pizza menu",
    example: `curl localhost:3000/api/order/menu`,
    response: [
      {
        id: 1,
        title: "Veggie",
        image: "pizza1.png",
        price: 0.0038,
        description: "A garden of delight",
      },
    ],
  },
  {
    method: "PUT",
    path: "/api/order/menu",
    requiresAuth: true,
    description: "Add an item to the menu",
    example: `curl -X PUT localhost:3000/api/order/menu -H 'Content-Type: application/json' -d '{ "title":"Student", "description": "No topping, no sauce, just carbs", "image":"pizza9.png", "price": 0.0001 }'  -H 'Authorization: Bearer tttttt'`,
    response: [
      {
        id: 1,
        title: "Student",
        description: "No topping, no sauce, just carbs",
        image: "pizza9.png",
        price: 0.0001,
      },
    ],
  },
  {
    method: "GET",
    path: "/api/order",
    requiresAuth: true,
    description: "Get the orders for the authenticated user",
    example: `curl -X GET localhost:3000/api/order  -H 'Authorization: Bearer tttttt'`,
    response: {
      dinerId: 4,
      orders: [
        {
          id: 1,
          franchiseId: 1,
          storeId: 1,
          date: "2024-06-05T05:14:40.000Z",
          items: [{ id: 1, menuId: 1, description: "Veggie", price: 0.05 }],
        },
      ],
      page: 1,
    },
  },
  {
    method: "POST",
    path: "/api/order",
    requiresAuth: true,
    description: "Create a order for the authenticated user",
    example: `curl -X POST localhost:3000/api/order -H 'Content-Type: application/json' -d '{"franchiseId": 1, "storeId":1, "items":[{ "menuId": 1, "description": "Veggie", "price": 0.05 }]}'  -H 'Authorization: Bearer tttttt'`,
    response: {
      order: {
        franchiseId: 1,
        storeId: 1,
        items: [{ menuId: 1, description: "Veggie", price: 0.05 }],
        id: 1,
      },
      jwt: "1111111111",
    },
  },
];

// getMenu
orderRouter.get(
  "/menu",
  asyncHandler(async (req, res) => {
    const startTime = new Date();
    const menu = await DB.getMenu();
    const endTime = new Date();
    trackServiceLatency(startTime, endTime);
    res.send(menu);
  })
);

// addMenuItem
orderRouter.put(
  "/menu",
  authRouter.authenticateToken,
  asyncHandler(async (req, res) => {
    const startTime = new Date();
    if (!req.user.isRole(Role.Admin)) {
      throw new StatusCodeError("unable to add menu item", 403);
    }

    const addMenuItemReq = req.body;
    await DB.addMenuItem(addMenuItemReq);
    const menu = await DB.getMenu();
    const endTime = new Date();
    trackServiceLatency(startTime, endTime);
    trackPizzaCreationLatency(startTime, endTime);
    res.send(menu);
  })
);

// getOrders
orderRouter.get(
  "/",
  authRouter.authenticateToken,
  asyncHandler(async (req, res) => {
    const startTime = new Date();
    const orders = await DB.getOrders(req.user, req.query.page);
    const endTime = new Date();
    trackServiceLatency(startTime, endTime);
    res.json(orders);
  })
);

// createOrder
orderRouter.post(
  "/",
  authRouter.authenticateToken,
  asyncHandler(async (req, res) => {
    const startTime = new Date();
    const orderReq = req.body;

    // Chaos monkey - randomly fail orders
    if (enableChaos && Math.random() < 0.5) {
      trackPizzaOrder(false);
      trackPizzaSales(orderReq.items, false);
      const endTime = new Date();
      trackServiceLatency(startTime, endTime);
      throw new StatusCodeError("Chaos monkey", 500);
    }

    const order = await DB.addDinerOrder(req.user, orderReq);
    const orderInfo = {
      diner: { id: req.user.id, name: req.user.name, email: req.user.email },
      order,
    };
    logger.factoryLogger(orderInfo);
    trackRevenue(orderReq.items);

    try {
      const r = await fetch(`${config.factory.url}/api/order`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          authorization: `Bearer ${config.factory.apiKey}`,
        },
        body: JSON.stringify({
          diner: {
            id: req.user.id,
            name: req.user.name,
            email: req.user.email,
          },
          order,
        }),
      });
      const j = await r.json();

      if (r.ok) {
        console.log("successful order Logs");
        trackPizzaOrder(true);
        trackPizzaSales(orderReq.items, true);
        const endTime = new Date();
        trackServiceLatency(startTime, endTime);
        res.send({
          order,
          reportSlowPizzaToFactoryUrl: j.reportUrl,
          jwt: j.jwt,
        });
      } else {
        console.log("unsuccessful order Logs");
        trackPizzaOrder(false);
        trackPizzaSales(orderReq.items, false);
        const endTime = new Date();
        trackServiceLatency(startTime, endTime);
        res.status(500).send({
          message: "Failed to fulfill order at factory",
          reportPizzaCreationErrorToPizzaFactoryUrl: j.reportUrl,
        });
      }
    } catch (error) {
      trackPizzaOrder(false);
      trackPizzaSales(orderReq.items, false);
      const endTime = new Date();
      trackServiceLatency(startTime, endTime);
      throw error;
    }
  })
);

// Chaos monkey control endpoint
let enableChaos = false;
orderRouter.put(
  "/chaos/:state",
  authRouter.authenticateToken,
  asyncHandler(async (req, res) => {
    console.log("Order Router Chaos Test was triggered");
    if (req.user.isRole(Role.Admin)) {
      enableChaos = req.params.state === "true";
    }
    res.json({ chaos: enableChaos });
  })
);

module.exports = orderRouter;
