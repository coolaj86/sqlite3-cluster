#brew options sqlcipher
#brew install sqlcipher --with-fts
echo STOP
echo You must manually install sqlcipher
exit 1

export LDFLAGS="-L`brew --prefix`/opt/sqlcipher/lib"
export CPPFLAGS="-I`brew --prefix`/opt/sqlcipher/include"
npm install sqlite3 --build-from-source --sqlite_libname=sqlcipher --sqlite=`brew --prefix`

node -e 'require("sqlite3")'
