import fs from 'fs';
import { swaggerSpec } from '../src/backend/docs/swaggerSpec';

fs.writeFileSync('./openapi-syncit.json', JSON.stringify(swaggerSpec, null, 2));
console.log('✅ OpenAPI spec written to openapi-syncit.json');

