FROM node:18-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

RUN npm install -g serve

EXPOSE 3000 3001

CMD sh -c "node server.js & serve ."