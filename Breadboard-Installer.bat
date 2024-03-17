@echo off
   echo This Batch file Installs or Updates to your HOMEDRIVE and    HOMEPATH into the Directory breadboard
   CD %HOMEDRIVE%%HOMEPATH%


:checkexist
   echo **** Check if Directory Breadboard exists 
   if exist Breadboard\ (
   echo Yes, Breadboard does exist and will now check for updates.
   ) else (
     echo No, Breadboard does not exist and will now be installed.
   )

:checkexistset
   echo **** Check if Directory Breadboard exists set variable var1
   if exist Breadboard\ (
   set /A var1=1
   ) else (
   set /A var1=0
   )
   echo this is what the variable var1 has been set as:
   echo %var1%

:Decider
   echo This subroutine is the Decider to update or install

   if %var1%==1 goto :Update
   if %var1%==0 goto :Install

:Update
   echo Running Git Pull to sync Breadboard directory
   cd breadboard
   echo Updating Git before pull of latest Breadboard repository
   git update-git-for-windows
   echo Updating Breadboard
   git pull 
   call npm start
   exit
 
:Install
   echo This is the Install subroutine it will do the initial    installation
   CD %HOMEDRIVE%%HOMEPATH%
   git clone https://github.com/cocktailpeanut/breadboard.git
   echo Launching Breadboard Browser
   CD %HOMEDRIVE%%HOMEPATH%
   CD breadboard
   call npm install
   call npm start
   exit


REM EOF end of file.
   




