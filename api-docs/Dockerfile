FROM node:16 as apiDocsbuilder
WORKDIR /usr/local/api-docs
COPY ./api-docs/package.json ./
COPY ./api-docs/tsconfig*.json ./
COPY ./api-docs/tslint.json ./
RUN npm install
ADD ./api-docs/src ./src
RUN npm run build:prod

FROM node:16
ENV PLATFORM="docker"
ENV NODE_ENV="production"
WORKDIR /usr/local/api-docs
COPY ./api-docs/package*.json ./
RUN npm install --production
COPY ./api-docs/api ./api
COPY --from=apiDocsbuilder /usr/local/api-docs/dist ./dist

CMD npm start
