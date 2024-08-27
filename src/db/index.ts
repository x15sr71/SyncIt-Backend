import { PrismaClient } from '@prisma/client';

let prisma: PrismaClient;


    global.prisma = new PrismaClient();
  
  prisma = global.prisma;


export default prisma;
