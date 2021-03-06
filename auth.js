const passport = require('passport');
const BearerStrategy = require('passport-http-bearer').Strategy;
const BasicStrategy = require('passport-http').BasicStrategy;
const ClientPasswordStrategy = require('passport-oauth2-client-password').Strategy;

const {MailToken, AccessToken} = require('./models/tokens');
const User = require('./models/people');
const Client = require('./models/client');

passport.serializeUser(function (user, done) {
  done(null, user._id);
});

passport.deserializeUser(function (userId, done) {
  User.get(userId)
    .catch(done)
    .then((user) => done(null, user));
});

/*
 * This authentication strategy is used when the end user
 * tries to authenticate on the website, generally because she
 * has been redirected here by a client.
 *
 * In this cas, she is first redirected to a form asking for her
 * email address: if she gives it, she is sent a message including
 * a link containing the access token used in this strategy.
 */
passport.use('mail_auth', new BearerStrategy(
  function (token, cb) {
    MailToken.findAndDelete(token)
      .then(function (mailToken) {
        if (mailToken === null) {
          return cb(null, false);
        } else {
          return User.get(mailToken.userId)
            .then((user) => cb(null, user, {direct: true}));
        }
      })
      .catch((err) => {
        cb(err);
      });
  }
));

/*
 * Used by the two authentication strategies just below
 */
function authenticateClient(username, password, done) {
  Client.authenticateClient(username, password)
    .catch(done)
    .then((client) => {
      return done(null, client);
    });
}

/*
 * Used by clients as part of the token exchange step of
 * the OAuth2 authentication process
 *
 * Clients may either use this basic strategy or the
 * ClientPasswordStrategy just below
 */
passport.use('client_basic', new BasicStrategy(authenticateClient));

/*
 * Used by clients as part of the token exchange step of
 * the OAuth2 authentication process
 *
 * Clients may either use this ClientPassword strategy or the
 * BasicStrategy just above
 */
passport.use('client_body', new ClientPasswordStrategy(authenticateClient));

/*
 * Used by clients when they are acting on behalf of the user,
 * using the AccessToken they obtained using OAuth2.
 */
passport.use('client_api', new BearerStrategy(
  function (accessToken, done) {
    AccessToken.find(accessToken)
      .then((token) => {
        return User.get(token.userId)
          .then((user) => user ? done(null, user, {scopes: token.scope}) : done(null, false));
      })
      .catch(done);
  }
));

/*
 * Middleware used to verify that the access token used for authentication
 * includes the scopes provided as argument
 */
exports.ensureScopesIncluded = function ensureScopesIncluded(scopes) {
  if (typeof scopes === 'string') {
    scopes = [scopes];
  }

  return function (req, res, next) {
    const currentScopes = req.authInfo && req.authInfo.scopes;

    if (currentScopes && scopes.every((s) => (currentScopes.includes(s)))) {
      next();
    } else {
      res.status(403).send({'status': 403, 'message': 'No authorization to see this page'});
    }
  };
};

exports.connect = passport.authenticate('mail_auth', {
  successReturnToOrRedirect: '/succes',
  failureRedirect: '/lien_incorrect'
});

exports.disconnect = function (req, res) {
  req.logout();
  res.redirect('/email');
};
