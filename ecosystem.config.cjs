module.exports = {
  apps: [
    {
      name: "my-planner",
      script: "dist/src/server.js",
      cwd: __dirname,
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
