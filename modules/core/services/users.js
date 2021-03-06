'use strict'
const bcrypt = require( 'bcrypt' )
const crs = require( 'crypto-random-string' )
const appRoot = require( 'app-root-path' )
const knex = require( `${appRoot}/db/knex` )

const Users = ( ) => knex( 'users' )
const Acl = ( ) => knex( 'server_acl' )

module.exports = {

  /*

        Users

     */

  async createUser( user ) {
    let [ { count } ] = await Acl( ).where( { role: 'server:admin' } ).count( )

    user.id = crs( { length: 10 } )

    if ( user.password ) {
      user.passwordDigest = await bcrypt.hash( user.password, 10 )
    }
    delete user.password

    let usr = await Users( ).select( 'id' ).where( { email: user.email } ).first( )
    if ( usr ) throw new Error( 'Email taken. Try logging in?' )

    let res = await Users( ).returning( 'id' ).insert( user )

    if ( parseInt( count ) === 0 ) {
      await Acl( ).insert( { userId: res[ 0 ], role: 'server:admin' } )
    } else {
      await Acl( ).insert( { userId: res[ 0 ], role: 'server:user' } )
    }

    return res[ 0 ]
  },

  async findOrCreateUser( { user, rawProfile } ) {
    let existingUser = await Users( ).select( 'id' ).where( { email: user.email } ).first( )

    if ( existingUser )
      return existingUser

    user.password = crs( { length: 20 } )
    user.verified = true // because we trust the external identity provider, no?
    return { id: await module.exports.createUser( user ) }
  },

  async getUserById( { userId } ) {
    let user = await Users( ).where( { id: userId } ).select( '*' ).first( )
    delete user.passwordDigest
    return user
  },

  // TODO: deprecate
  async getUser( id ) {
    let user = await Users( ).where( { id: id } ).select( '*' ).first( )
    delete user.passwordDigest
    return user
  },

  async getUserByEmail( { email } ) {
    let user = await Users( ).where( { email: email } ).select( '*' ).first( )
    delete user.passwordDigest
    return user
  },

  async getUserRole( id ) {
    let { role } = await Acl( ).where( { userId: id } ).select( 'role' ).first( )
    return role
  },

  async updateUser( id, user ) {
    delete user.id
    delete user.passwordDigest
    delete user.password
    delete user.email
    await Users( ).where( { id: id } ).update( user )
  },

  async searchUsers( searchQuery, limit, cursor ) {
    limit = limit || 25

    let query = Users( )
      .select( 'id', 'username', 'name', 'bio', 'company', 'verified', 'avatar', 'createdAt' )
      .where( queryBuilder => {
        queryBuilder.where( { email: searchQuery } ) //match full email or partial username / name
        queryBuilder.orWhere( 'username', 'ILIKE', `%${searchQuery}%` )
        queryBuilder.orWhere( 'name', 'ILIKE', `%${searchQuery}%` )
      } )

    if ( cursor )
      query.andWhere( 'users.createdAt', '<', cursor )

    query.orderBy( 'users.createdAt', 'desc' ).limit( limit )

    let rows = await query
    return { users: rows, cursor: rows.length > 0 ? rows[ rows.length - 1 ].createdAt.toISOString( ) : null }
  },

  async validatePasssword( { email, password } ) {
    let { passwordDigest } = await Users( ).where( { email: email } ).select( 'passwordDigest' ).first( )
    return bcrypt.compare( password, passwordDigest )
  },

  async deleteUser( id ) {
    throw new Error( 'not implemented' )
  }
}
