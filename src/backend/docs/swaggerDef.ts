export const swaggerDefinition = {
  openapi: '3.0.0',
  info: {
    title: 'Syncit API',
    version: '1.0.0',
    description: 'API documentation for the Syncit backend',
  },
  servers: [
    {
      url: 'http://localhost:3000/api',
      description: 'Local dev server',
    },
  ],
};
