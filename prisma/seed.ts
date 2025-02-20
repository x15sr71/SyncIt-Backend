import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Seed the User model with a single record
  await prisma.user.create({
    data: {
      id: 1,
      email: "",
      username: "",
      profilePicture: "",
      access_token: "",
      refresh_token: "",
      createdAt: new Date(), // Current date and time
      correspondingTrackIds: "",
    },
  });

  console.log("Seeding completed!");
}

main()
  .catch((e) => {
    console.error("Error seeding the database:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
