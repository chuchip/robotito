FROM nginx:latest
COPY default-nginx.conf /etc/nginx/conf.d/default.conf
RUN mkdir -p /www/robotito
COPY dist/robotito_ng/browser /www/robotito
LABEL maintainer="Andrew <XXXXXXYYYZZZZ@gmail.com>" \ version="1.0"
CMD ["nginx", "-g", "daemon off;"]