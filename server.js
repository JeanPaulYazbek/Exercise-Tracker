const express = require('express')
const app = express()
const bodyParser = require('body-parser')

const cors = require('cors')

const mongoose = require('mongoose')
mongoose.Promise = global.Promise; // ADD THIS
mongoose.connect(process.env.MLAB_URI )

app.use(cors())

app.use(bodyParser.urlencoded({extended: false}))
app.use(bodyParser.json())


app.use(express.static('public'))
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/views/index.html')
});


//CREAMOS EL ESQUEMA DE USUARIOS
const shortid = require('shortid')
const Schema = mongoose.Schema

var Users = new Schema({
  username: {
    type: String, 
    required: true,
    unique: true,
    maxlength: [20, 'username too long']
  },
  _id: {
    type: String,
    index: true,
    default: shortid.generate
  }
})

var UsersModel = mongoose.model('UsersModel', Users);

//CREAMOS EL ESQUEMA DE EJERCICIOS

'use strict'
const Exercises = new Schema({
  description: {
    type: String,
    required: true,
    maxlength: [20, 'description too long']
  },
  duration: {
    type: Number,
    required: true,
    min: [1, 'duration too short']
  },
  date: {
    type: Date,
    default: Date.now
  },
  username: String,
  userId: {
    type: String,
    ref: 'Users',
    index: true
  }
})



// Antes de guardar un ejercicio le asignamos el nombre de usuario
Exercises.pre('save', function(next) {
  mongoose.model('UsersModel').findById(this.userId, (err, user) => {
    if(err) return next(err)
    if(!user) {
      const err = new Error('unknown userId')
      err.status = 400
      return next(err)
    }
    this.username = user.username
    if(!this.date) {
      this.date = Date.now()
    }
    next();
  })
})

var ExercisesModel = mongoose.model('ExercisesModel', Exercises);

//AQUI CREAMOS USUARIO CUANDO SE HACE UN POST
app.post('/api/exercise/new-user', (req, res, next) => {
  const user = new UsersModel(req.body)
  console.log("antes de guardar")
  user.save((err, savedUser) => {
    console.log("error")
    if(err) {
      console.log("error")
      if(err.code == 11000) {
        console.log("error no unico")
        // uniqueness error (no custom message)
        return next({
          status: 400,
          message: 'username already taken'
        })
      } else {
        console.log("otro error")
        return next(err)
      }
    }
    console.log("antes de json")
    res.json({
      username: savedUser.username,
      _id: savedUser._id
    })
    console.log("despues de json")
  })
})

//AQUI SE ANNADE UN EJERCICIO A UN USUARIO
app.post('/api/exercise/add', (req, res, next) => {
  
  UsersModel.findById(req.body.userId, (err, user) => {
    if(err) return next(err)
    if(!user) {
      return next({
        status: 400,
        message: 'unknown _id'
      })
    }
    const exercise = new ExercisesModel(req.body)
    exercise.username = user.username
    exercise.save((err, savedExercise) => {
      if(err) return next(err)
      savedExercise = savedExercise.toObject()
      delete savedExercise.__v
      savedExercise._id = savedExercise.userId
      delete savedExercise.userId
      savedExercise.date = (new Date(savedExercise.date)).toDateString()
      res.json(savedExercise)
    })
  })
})

//AQUI SE DEVUELVE LA LISTA DE USUARIOS
app.get('/api/exercise/users', (req,res,next) => {
  UsersModel.find({}, (err, data) => {
    res.json(data)
  })
})

//AQUI SE MUESTRAN LOS EJERCICIOS DE UN USUARIO PARTICULAR
app.get('/api/exercise/log', (req, res, next) => {
  const from = new Date(req.query.from)
  const to = new Date(req.query.to)
  console.log(req.query.userId)
  UsersModel.findById(req.query.userId, (err, user) => {
    if(err) return next(err);
    if(!user) {
      return next({status:400, message: 'unknown userId'})
    }
    console.log(user)
    ExercisesModel.find({
      userId: req.query.userId,
        date: {
          $lt: to != 'Invalid Date' ? to.getTime() : Date.now() ,
          $gt: from != 'Invalid Date' ? from.getTime() : 0
        }
      }, {
        __v: 0,
        _id: 0
      })
    .sort('-date')
    .limit(parseInt(req.query.limit))
    .exec((err, exercises) => {
      if(err) return next(err)
      const out = {
          _id: req.query.userId,
          username: user.username,
          from : from != 'Invalid Date' ? from.toDateString() : undefined,
          to : to != 'Invalid Date' ? to.toDateString(): undefined,
          count: exercises.length,
          log: exercises.map(e => ({
            description : e.description,
            duration : e.duration,
            date: e.date.toDateString()
          })
        )
      }
      res.json(out)
    })
  })
})


// Not found middleware
app.use((req, res, next) => {
  return next({status: 404, message: 'not found'})
})

// Error Handling middleware
app.use((err, req, res, next) => {
  let errCode, errMessage

  if (err.errors) {
    // mongoose validation error
    errCode = 400 // bad request
    const keys = Object.keys(err.errors)
    // report the first validation error
    errMessage = err.errors[keys[0]].message
  } else {
    // generic or custom error
    errCode = err.status || 500
    errMessage = err.message || 'Internal Server Error'
  }
  res.status(errCode).type('txt')
    .send(errMessage)
})

const listener = app.listen(process.env.PORT || 3000, () => {
  console.log('Your app is listening on port ' + listener.address().port)
})
