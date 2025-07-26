import swaggerJsdoc from 'swagger-jsdoc';
import { swaggerDefinition } from './swaggerDef';

const options = {
  swaggerDefinition,
  apis: ['src/backend/routes/**/*.ts'], // scan all your route files
};

export const swaggerSpec = swaggerJsdoc(options);
