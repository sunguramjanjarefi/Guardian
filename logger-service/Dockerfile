FROM node:16 AS interfacesModuleBuilder
WORKDIR /usr/local/interfaces
COPY ./interfaces/package*.json ./
COPY ./interfaces/tsconfig*.json ./
ADD ./interfaces/src ./src/.
RUN npm install
RUN npm pack

FROM node:16 AS commonModuleBuilder
WORKDIR /usr/local/common
COPY --from=interfacesModuleBuilder /usr/local/interfaces/guardian-interfaces-*.tgz ./
COPY ./common/package*.json ./
COPY ./common/tsconfig*.json ./
RUN npm install guardian-interfaces-*.tgz
ADD ./common/src ./src/.
RUN npm pack

FROM node:16 AS loggerServiceBuilder
WORKDIR /usr/local/logger-service
COPY --from=interfacesModuleBuilder /usr/local/interfaces/guardian-interfaces-*.tgz ./
COPY --from=commonModuleBuilder /usr/local/common/guardian-common-*.tgz ./
COPY ./logger-service/package*.json ./
COPY ./logger-service/tsconfig*.json ./
RUN npm install guardian-interfaces-*.tgz guardian-common-*.tgz
ADD ./logger-service/src ./src/.
RUN npm run build:prod

FROM node:16
ENV PLATFORM="docker"
ENV NODE_ENV="production"
WORKDIR /usr/local/logger-service
COPY --from=interfacesModuleBuilder /usr/local/interfaces/guardian-interfaces-*.tgz ./
COPY --from=commonModuleBuilder /usr/local/common/guardian-common-*.tgz ./
COPY ./logger-service/package*.json ./
COPY ./logger-service/.env.docker ./.env
RUN npm install --production guardian-interfaces-*.tgz guardian-common-*.tgz
COPY --from=loggerServiceBuilder /usr/local/logger-service/dist ./dist
RUN rm guardian-*.tgz

CMD npm start
