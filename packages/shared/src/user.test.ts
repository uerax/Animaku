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
    const bangumiUser: UserProfile = {
      id: 123456,
      username: 'testuser',
      nickname: '测试用户',
      avatarUrl: 'https://example.com/avatar.jpg',
      provider: 'bangumi',
      extra: { bangumiUser: { id: 123456 } },
    }
    assert.equal(isGuestUser(bangumiUser), false)

    const localUser: UserProfile = {
      id: 'usr_abc123',
      username: 'localadmin',
      nickname: '站长',
      email: 'admin@example.com',
      provider: 'local',
    }
    assert.equal(isGuestUser(localUser), false)
  })

  it('handles edge case guest identifiers', () => {
    assert.equal(
      isGuestUser({
        id: 'guest',
        username: 'someone',
        nickname: '临时用户',
        provider: 'local',
      }),
      true,
    )
    assert.equal(
      isGuestUser({
        id: 'some_id',
        username: 'guest',
        nickname: '游客',
        provider: 'guest',
      }),
      true,
    )
  })

  it('preserves frozen immutability of GUEST_USER_PROFILE', () => {
    assert.equal(Object.isFrozen(GUEST_USER_PROFILE), true)
    assert.equal(GUEST_USER_PROFILE.provider, 'guest')
    assert.equal(GUEST_USER_PROFILE.id, 'guest')
  })
})
