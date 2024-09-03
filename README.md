
# Sync_It Backend

The Sync_It backend is a powerful and scalable Express.js application designed to manage the heavy lifting required for syncing liked songs across multiple music platforms, such as Spotify and YouTube. This backend serves as the core engine for the Sync_It ecosystem, handling user authentication, API requests, data processing, and synchronization tasks efficiently.

This repository is the foundation of the Sync_It project, providing the essential backend services that power the entire application. It’s designed to be flexible and extendable, allowing easy integration of additional music platforms and future enhancements.

## Tech Stack

**Client:** Nextjs, TailwindCSS, Shadcn

**Server:** Node.js
TypeScript
Express.js
Axios
Youtube API
Spotify API

## Contributing

Contributions are always welcome!

See `contributing.md` for ways to get started.

Please adhere to this project's `code of conduct`.


## Run Locally

Clone the project

```bash
  git clone https://github.com/your-username/sync_it_backend.git
```

Go to the project directory

```bash
  cd sync_it_backend
```

Install dependencies

```bash
  npm i
````

create a .env similar to .env.example

Ensure your PostgreSQL database is running. If you're using a local PostgreSQL instance, set up your database as specified in the DATABASE_URL.

Run database migrations
```bash
  npx prisma migrate dev
````

Build the Project
````bash
  npm run build
````
Start Development Server

````bash
  npm run start
````
