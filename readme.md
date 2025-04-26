## install

git clone
docker build -t bjj-roundtimer .
docker run -p 3000:3000 -p 3001:3001 bjj-roundtimer

add ports in ufw.
#sudo ufw allow 3000
#sudo ufw allow 3001

## Features

- round robin
- synced timer on multiple devices (smartphones)
- round- and breaktime editable

## Todo

- sound indicators
- share with link/ qr code
- save username/session id
- stop timer when noone is connected (array w users - check vs combatants s)
- make editin combatants easier
