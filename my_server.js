const express = require('express');
const hb = require('express-handlebars');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const spicedPg = require('spiced-pg');
const cookieSession = require('cookie-session');
const bcrypt = require('./bcrypt.js');
const csurf = require('csurf');

//-- SET UP EXPRESS APP --//
const app = express();

//-- SET UP VIEW ENGINE --//
app.engine('handlebars', hb());
app.set('view engine', 'handlebars');

//-- SET UP DATABASE --//
var db = spicedPg(process.env.DATABASE_URL ||'postgres://postgres:postgres@localhost:5432/signature');

//-- MIDDLEWARE --//
app.use(cookieParser());
app.use(bodyParser.urlencoded({
    extended:false
}));

app.use(cookieSession({
    secret: 'hard to guess',
    maxAge: 1000*60*60*24*14
}));

app.use(csurf());

//-- SERVE FILES --//
app.use('/public', express.static(__dirname + '/public'));

//-- ROUTES --//
app.get('/',(req,res)=>{

    res.redirect('/register');
});

//-- REGISTER --//
app.get('/register',function(req,res){
    res.render('register',{
        csrfToken:req.csrfToken(),
        layout:'main'
    });
});
app.post('/register',(req,res)=>{
    if(!req.body.first || !req.body.last || !req.body.email || !req.body.password) {

    //var remainder = "Please fill the missed fields";
        res.render('register',{
            layout: 'main',
            error: "Please fill the required fields",
            csrfToken: req.csrfToken()
        });
    }
    else{
        const firstname = req.body.first;
        const lastname = req.body.last;
        const email = req.body.email;
        const q = 'INSERT INTO users (first, last, email, password) VALUES ($1,$2,$3,$4) RETURNING id';
        console.log(q);

        bcrypt.hashPassword(req.body.password).then((hash)=>{
            const params = [firstname,lastname,email,hash];
            db.query(q,params).then(result=>{
                req.session.user = {
                    first: firstname,
                    last:lastname,
                    id: result.rows[0].id,
                };
                res.redirect('/profile');

            });

        });
    }});

// -- PROFILE --//
app.get('/profile',function(req,res){
    res.render('profile',{
        csrfToken:req.csrfToken(),
        layout:'main'
    });
});


app.post('/profile',(req,res)=>{
    var userAge = req.body.age || null;
    var userCity = req.body.city || null;
    var url = req.body.url || null;

    if(req.body.age || req.body.city || req.body.homepage) {
        req.session.user.age = userAge,
        req.session.user.city = userCity,
        req.session.user.url = url;

        const q = `INSERT INTO user_profiles (user_id, age, city, url) VALUES ($1, $2, $3, $4)`;
        const params = [req.session.user.id, userAge, userCity, url];
        db.query(q,params).then(()=>{
            res.redirect('/signature');
        })
       .catch(err => console.log(err));
    }
    else {
        res.redirect('/signature');
    }
});

//-- LOGIN --//
app.post('/logout', (req, res) => {
    req.session = null;
    res.redirect('/register');
});
app.get('/login',function(req,res){
    res.render('login',{
        csrfToken:req.csrfToken(),
        layout:'main'
    });
});
app.post('/login', (req, res) => {
    if (!req.body.email || !req.body.password) {
        res.render('login', {
            csrfToken: req.csrfToken(),
            layout: 'main',
            error: "Please fill out the required input fields"
        });
    } else {
        const email = [req.body.email];
        const q = 'SELECT * FROM users WHERE email = $1';
        db.query(q, email)
      .then((result) => {
          const data = result.rows[0];
          if (data) {
              bcrypt.checkPassword(req.body.password, data.password)
            .then((doesMatch) => {
                if (doesMatch) {
                    req.session.user = {
                        first: data.first,
                        last: data.last,
                        id: data.id
                    };
                    db.query("SELECT id FROM signatures WHERE user_id = $1", [data.id])
                  .then((result) => {
                      if(result.rows.length){
                          req.session.user.signatureId = data.id;
                          res.redirect('signature/signed');
                      } else {
                          res.redirect('/');
                      }
                  });
                } else {
                    res.render('login', {
                        csrfToken: req.csrfToken(),
                        layout: 'main',
                        error: "The password you entered was not correct"
                    });
                }
            });
          } else {
              res.render('login', {
                  csrfToken: req.csrfToken(),
                  layout: 'main',
                  error: "The email you entered was not correct"
              });
          }
      });
    }
});

//-- SIGNATURE --//
app.get('/signature', (req, res) => {
    if (!req.session.user) {
        res.redirect('/register');
    } else {
        if(req.session.user.signatureId){
            res.redirect("/signature/signed");
        } else{
            res.render('signature', {
                csrfToken: req.csrfToken(),
                layout: 'main',
                first: req.session.user.first,
                last: req.session.user.last
            });
        }
    }
});

app.post('/signature', (req, res) => {
    const signature = req.body.signature;
    const user_id = req.session.user.id;

    const q = `INSERT INTO signatures (signature, user_id) VALUES ($1,$2) RETURNING id;`;
    const params = [signature, user_id];

    db.query(q, params).then(() => {
        req.session.user.signatureId = user_id;
        res.redirect('/signature/signed');
    }).catch((err) => {
        console.log(err);
    });

});

app.get('/signature/signed', (req, res) => {
    if (!req.session.user) {
        res.redirect('/register');
    } else {
        const q = `SELECT signature FROM signatures WHERE user_id = $1;`;
        const qNum = `SELECT * FROM signatures`;
        const id = [req.session.user.signatureId];
        var count;
        db.query(qNum).then((result) => {count = result.rowCount});
        db.query(q, id).then((result) => {

            res.render('thankyou', {
                csrfToken: req.csrfToken(),
                layout: 'main',
                user: req.session.user


            });

        });
    }
});

//-- SIGNERS --//
app.get('/signature/signers', (req, res) => {
    if (!req.session.user) {
        res.redirect('/register');
    } else {
        const q = `SELECT users.first AS first_name, users.last AS last_name, user_profiles.age, user_profiles.city,user_profiles.url
               FROM users
               JOIN user_profiles
               ON users.id = user_profiles.user_id`;
        db.query(q)
      .then(results => {
          res.render('signers', {
              csrfToken: req.csrfToken(),
              layout: 'main',
              name: results.rows
          });
      });
    }
});

app.get('/signature/signers/:city', (req,res) => {
    var city = [req.params.city];
    const q = `SELECT users.first AS first_name, users.last AS last_name, user_profiles.age, user_profiles.url
             FROM users
             JOIN user_profiles
             ON users.id = user_profiles.user_id
             WHERE user_profiles.city = $1 `;
    db.query(q,city)
    .then((result) => {
        res.render('signers', {
            csrfToken: req.csrfToken(),
            layout: 'main',
            name: result.rows
        });
    });
});

//EDIT PROFILE
app.get('/profile/edit', (req,res) => {
    const currentUser = [req.session.user.id];
    const q = `SELECT users.first AS first_name, users.last AS last_name, users.email, user_profiles.age, user_profiles.city, user_profiles.url
             FROM users
             JOIN user_profiles
             ON users.id = user_profiles.user_id
             WHERE users.id = $1`;

    db.query(q, currentUser).then((result) => {
        res.render('editprofile', {
            csrfToken: req.csrfToken(),
            layout: 'main',
            data: result.rows[0]
        });
    });
});

app.post('/profile/edit', (req,res) => {
    const id = req.session.user.id;
    const {first,last,email,password,age,city,url} = req.body;
    const qUsers = `UPDATE users SET first = $1, last = $2, email = $3  WHERE users.id = $4`;
    const paramsUsers = [first,last,email,id];
    const qUserProfiles = `UPDATE user_profiles SET age = $1, city = $2, url = $3  WHERE user_profiles.user_id = $4`
    const paramsUserProfiles = [age,city,url,id];
    const qPassword = `UPDATE users SET password = $1 WHERE users.id = $2`;

    if (!password){
        console.log("Password did not change");
    } else {
        bcrypt.hashPassword(password)
      .then((hash) => {
            db.query(qPassword, [hash, id])
      })
      .then((result) => {
          console.log('Changed Password');
      });
    }

    db.query(qUsers, paramsUsers).then(
    () => {console.log("Users Table upated");
    });
    db.query(qUserProfiles, paramsUserProfiles).then(
    () => {console.log("User Profile Table upated");
        res.redirect('/signature/signed');
    });
});

// -- LISTEN PORT --//
app.listen(process.env.PORT || 8080,()=>{
    console.log("listening on port 8080");
});
