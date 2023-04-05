#!/bin/bash

set -x
set -e

export PROJECT_DIR=`pwd`
export BACKEND_BIN='archive-assembly-0.1.0-SNAPSHOT.jar'

build () {
  cd $PROJECT_DIR
  echo "Building frontend"

  cd app
  pwd
  yarn build
  rm -rf build.zip
  zip -vr build.zip build/ -x "*.DS_Store"

  echo "Building backend"

  cd ../
  pwd
  sbt assembly
}

upload () {
  cd $PROJECT_DIR
  pwd

  echo "Uploading backend"
  scp -i $SSH_KEY target/scala-2.13/$BACKEND_BIN $SSH_USER@$REMOTE_HOST:/home/$SSH_USER/$BACKEND_BIN

  echo "Uploading frontend"
  scp -i $SSH_KEY app/build.zip $SSH_USER@$REMOTE_HOST:/home/$SSH_USER/build.zip

  echo "Uploading server install script"
  scp -i $SSH_KEY installer.sh $SSH_USER@$REMOTE_HOST:/home/$SSH_USER/installer.sh

  echo "Uploading backend service"
  scp -i $SSH_KEY h3historian.service $SSH_USER@$REMOTE_HOST:/home/$SSH_USER/h3historian.service

  echo "Uploading nginx config"
  scp -i $SSH_KEY nginx.conf $SSH_USER@$REMOTE_HOST:/home/$SSH_USER/nginx.conf
}

install () {
  cd $PROJECT_DIR
  ssh -i $SSH_KEY $SSH_USER@$REMOTE_HOST "/bin/bash -c \"chmod +x /home/$SSH_USER/installer.sh && /home/$SSH_USER/installer.sh server\""
}

if [ $# -eq 0 ]
then
  echo "No arguments supplied. Building client side"
  build
  upload
  install

elif [ "$1" == "build" ]
then
  build

elif [ "$1" == "upload" ]
then
  upload

elif [ "$1" == "install" ]
then
  install

elif [ "$1" == "server" ]
then
  echo "Installing server-side"

  cd $HOME
  pwd
  ls -al

  sudo rm -rf build
  unzip build.zip
  sudo chown -R nginx build
  sudo rm -rf /public_html
  sudo mv build /public_html

  sudo mv h3historian.service /etc/systemd/system/h3historian.service

  sudo systemctl stop h3historian
  mv $BACKEND_BIN h3-historian.jar
  sudo systemctl start h3historian

  sudo mv nginx.conf /etc/nginx/conf.d/server1.conf
  sudo systemctl restart nginx

elif [ "$1" == "ssh" ]
then
  echo "SSHing into remote host"

  ssh -i $SSH_KEY $SSH_USER@$REMOTE_HOST
fi