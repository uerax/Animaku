import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  isGuestUser,
  GUEST_USER_PROFILE,
  type UserProfile,
} from './user.ts'

describe('User domain model & helpers', () => {
  it('identifies guest user correctly', () => {
    assert.equal(isGuestUser(null), true)
    assert.equal(isGuestUser(undefined), true)
    assert.equal(isGuestUser(GUEST_USER_PROFILE), true)
    assert.equal(
      isGuestUser({
        id: 'guest',
        username: 'guest',
        nickname: '访客',
        provider: 'guest',
      }),
      true,
    )
  })

  it('identifies authenticated user correctly', () => {
    const user: UserProfile = {
      id: 123456,
      username: 'testuser',
      nickname: '测试用户',
      avatarUrl: 'https://example.com/avatar.jpg',
      provider: 'bangumi',
    }
    assert.equal(isGuestUser(user), false)
  })
})
