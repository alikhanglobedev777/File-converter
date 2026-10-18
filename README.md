# File Converter: MongoDB Atlas setup

The Express backend uses Mongoose to store accounts in the `users` collection of
the `file_converter` database. Passwords are hashed with bcrypt. Converted files
still use the local `server/uploads` and `server/outputs` folders.

## 1. Create your Atlas cluster

1. Sign in at [MongoDB Atlas](https://cloud.mongodb.com/) and create a project
   named `File Converter`.
2. Create a cluster. Choose the **Free** option for development and a region near
   your application. Wait for the cluster to become available.
3. Under **Database Access**, create a password-based database user, such as
   `file_converter_app`. This is separate from your Atlas account. Give it the
   `readWrite` role on `file_converter` using a specific database privilege.
4. Under **Network Access**, add your current public IP address. When you deploy
   the backend, add the hosting server's outbound IP address as well.
5. Open your cluster's **Connect > Drivers** dialog, select **Node.js**, and copy
   the `mongodb+srv://...` connection string.

Official guides: [create a free cluster](https://www.mongodb.com/docs/atlas/tutorial/deploy-free-tier-cluster/),
[connect an application](https://www.mongodb.com/docs/atlas/driver-connection/).

## 2. Configure this project

Edit `server/.env`. If it does not exist in a fresh checkout, copy
`server/.env.example` to `server/.env` first. Keep existing secrets when updating
an already configured installation.

```dotenv
PORT=5000
MONGO_URI="mongodb+srv://<db_username>:<db_password>@<cluster_host>/?retryWrites=true&w=majority"
MONGO_DB_NAME=file_converter
JWT_SECRET=<a-random-secret-at-least-32-characters>
```

Replace the URI with the one copied from Atlas, inserting the database username
and password. Replace every `<placeholder>`, including its angle brackets. Keep
the actual cluster hostname and connection options supplied by Atlas. Percent-encode
special characters in the username/password (for example, `@` becomes `%40`).
`MONGO_DB_NAME` selects the database even if Atlas's URI has an empty database path.

The local setup prepared for this workspace already has a generated JWT secret.
On a fresh checkout, generate your own using:

```powershell
node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"
```

Use that output as `JWT_SECRET`. Changing it invalidates previously issued login
tokens. Keep all these values on the backend; never put the Atlas URI in frontend
code or a `VITE_` variable. `.env` files are ignored by Git.

## 3. Check the connection and run

From the project root:

```powershell
cd server
npm install
npm run check:db
npm start
```

`check:db` connects, pings MongoDB, and disconnects. It does not create accounts
or verify write permissions. Successful startup prints `MongoDB connected
successfully`, followed by `Server running on port 5000`. The HTTP server starts
only after MongoDB connects. Both `npm start` from `server` and
`node server/server.js` from the project root load the same `server/.env`.

In a second terminal, from the project root:

```powershell
cd client/pdf
npm install
npm run dev
```

Open the URL Vite prints, sign up, and then log in. In Atlas's Data Explorer /
Browse Collections, look for `file_converter > users`. MongoDB creates the
database and collection when needed; you do not need to define a schema in Atlas.
To create them manually first, choose **Create Database**, database name
`file_converter`, and collection name `users`.
See [Atlas database creation](https://www.mongodb.com/docs/atlas/atlas-ui/databases/).

Check readiness at `http://localhost:5000/api/health`. It returns HTTP 200 when
Mongoose is connected, or HTTP 503 if disconnected. The frontend currently expects
the backend on local port 5000.

## Troubleshooting

- **Missing configuration:** replace URI placeholders and set a JWT secret of at
  least 32 characters.
- **Authentication failure:** use the database user's credentials, not your Atlas
  website password, and encode special characters in the URI.
- **Connection failure:** check the current IP access list, internet/DNS access,
  and that the Atlas cluster is available and not paused.
- **Signup fails after a successful ping:** check that the database user has
  `readWrite` access to the database named in `MONGO_DB_NAME`.

Run the backend configuration tests with `npm test` inside `server`.
If PowerShell blocks `npm.ps1`, use `npm.cmd` in place of `npm` in these commands.
