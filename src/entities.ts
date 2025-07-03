import { Entity } from 'prismarine-entity'
import { versionToNumber } from 'renderer/viewer/common/utils'
import tracker from '@nxg-org/mineflayer-tracker'
import { loader as autoJumpPlugin } from '@nxg-org/mineflayer-auto-jump'
import { subscribeKey } from 'valtio/utils'
import { getThreeJsRendererMethods } from 'renderer/viewer/three/threeJsMethods'
import { Team } from 'mineflayer'
import { options, watchValue } from './optionsStorage'
import { gameAdditionalState, miscUiState } from './globalState'
import { EntityStatus } from './mineflayer/entityStatus'


const updateAutoJump = () => {
  if (!bot?.autoJumper) return
  const autoJump = options.autoParkour || (options.autoJump === 'auto' ? miscUiState.currentTouch && !miscUiState.usingGamepadInput : options.autoJump === 'always')
  bot.autoJumper.setOpts({
    // jumpIntoWater: options.autoParkour,
    jumpOnAllEdges: options.autoParkour,
    // strictBlockCollision: true,
  })
  if (autoJump === bot.autoJumper.enabled) return
  if (autoJump) {
    bot.autoJumper.enable()
  } else {
    bot.autoJumper.disable()
  }
}
subscribeKey(options, 'autoJump', () => {
  updateAutoJump()
})
subscribeKey(options, 'autoParkour', () => {
  updateAutoJump()
})
subscribeKey(miscUiState, 'usingGamepadInput', () => {
  updateAutoJump()
})
subscribeKey(miscUiState, 'currentTouch', () => {
  updateAutoJump()
})

customEvents.on('gameLoaded', () => {
  bot.loadPlugin(tracker)
  bot.loadPlugin(autoJumpPlugin)
  updateAutoJump()

  const playerPerAnimation = {} as Record<string, string>
  const checkEntityData = (e: Entity) => {
    if (!e.username) return
    window.debugEntityMetadata ??= {}
    window.debugEntityMetadata[e.username] = e
    if (e.type === 'player') {
      bot.tracker.trackEntity(e)
    }
  }

  const trackBotEntity = () => {
    // Always track the bot entity for animations
    if (bot.entity) {
      bot.tracker.trackEntity(bot.entity)
    }
  }

  let lastCall = 0
  bot.on('physicsTick', () => {
    // throttle, tps: 6
    if (Date.now() - lastCall < 166) return
    lastCall = Date.now()
    for (const [id, { tracking, info }] of Object.entries(bot.tracker.trackingData)) {
      if (!tracking) continue
      const e = bot.entities[id]
      if (!e) continue
      const speed = info.avgVel
      const WALKING_SPEED = 0.03
      const SPRINTING_SPEED = 0.18
      const isCrouched = e === bot.entity ? gameAdditionalState.isSneaking : e['crouching']
      const isWalking = Math.abs(speed.x) > WALKING_SPEED || Math.abs(speed.z) > WALKING_SPEED
      const isSprinting = Math.abs(speed.x) > SPRINTING_SPEED || Math.abs(speed.z) > SPRINTING_SPEED

      const newAnimation =
        isCrouched ? (isWalking ? 'crouchWalking' : 'crouch')
          : isWalking ? (isSprinting ? 'running' : 'walking')
            : 'idle'
      if (newAnimation !== playerPerAnimation[id]) {
        // Handle bot entity animation specially (for player entity in third person)
        if (e === bot.entity) {
          getThreeJsRendererMethods()?.playEntityAnimation('player_entity', newAnimation)
        } else {
          getThreeJsRendererMethods()?.playEntityAnimation(e.id, newAnimation)
        }
        playerPerAnimation[id] = newAnimation
      }
    }
  })

  bot.on('entitySwingArm', (e) => {
    getThreeJsRendererMethods()?.playEntityAnimation(e.id, 'oneSwing')
  })

  bot.on('botArmSwingStart', (hand) => {
    if (hand === 'right') {
      getThreeJsRendererMethods()?.playEntityAnimation('player_entity', 'oneSwing')
    }
  })

  bot.inventory.on('updateSlot', (slot) => {
    if (slot === 5 || slot === 6 || slot === 7 || slot === 8) {
      const item = bot.inventory.slots[slot]!
      bot.entity.equipment[slot - 3] = item
      appViewer.worldView?.emit('playerEntity', bot.entity)
    }
  })
  bot.on('heldItemChanged', () => {
    const item = bot.inventory.slots[bot.quickBarSlot + 36]!
    bot.entity.equipment[0] = item
    appViewer.worldView?.emit('playerEntity', bot.entity)
  })

  bot._client.on('damage_event', (data) => {
    const { entityId, sourceTypeId: damage } = data
    getThreeJsRendererMethods()?.damageEntity(entityId, damage)
  })

  bot._client.on('entity_status', (data) => {
    if (versionToNumber(bot.version) >= versionToNumber('1.19.4')) return
    const { entityId, entityStatus } = data
    if (entityStatus === EntityStatus.HURT) {
      getThreeJsRendererMethods()?.damageEntity(entityId, entityStatus)
    }
  })

  const updateCamera = (entity: Entity) => {
    if (bot.game.gameMode !== 'spectator') return
    bot.entity.position = entity.position.clone()
    void bot.look(entity.yaw, entity.pitch, true)
    bot.entity.yaw = entity.yaw
    bot.entity.pitch = entity.pitch
  }

  bot.on('entityGone', (entity) => {
    bot.tracker.stopTrackingEntity(entity, true)
  })

  bot.on('entityMoved', (e) => {
    checkEntityData(e)
    if (appViewer.playerState.reactive.cameraSpectatingEntity === e.id) {
      updateCamera(e)
    }
  })
  bot._client.on('entity_velocity', (packet) => {
    const e = bot.entities[packet.entityId]
    if (!e) return
    checkEntityData(e)
  })

  for (const entity of Object.values(bot.entities)) {
    if (entity !== bot.entity) {
      checkEntityData(entity)
    }
  }

  // Track bot entity initially
  trackBotEntity()

  bot.on('entitySpawn', (e) => {
    checkEntityData(e)
    if (appViewer.playerState.reactive.cameraSpectatingEntity === e.id) {
      updateCamera(e)
    }
  })
  bot.on('entityUpdate', checkEntityData)
  bot.on('entityEquip', checkEntityData)

  // Re-track bot entity after login
  bot.on('login', () => {
    setTimeout(() => {
      trackBotEntity()
    }) // Small delay to ensure bot.entity is properly set
  })

  bot._client.on('camera', (packet) => {
    if (bot.player.entity.id === packet.cameraId) {
      if (appViewer.playerState.utils.isSpectatingEntity() && appViewer.playerState.reactive.cameraSpectatingEntity) {
        const entity = bot.entities[appViewer.playerState.reactive.cameraSpectatingEntity]
        appViewer.playerState.reactive.cameraSpectatingEntity = undefined
        if (entity) {
          // do a force entity update
          bot.emit('entityUpdate', entity)
        }
      }
    } else if (appViewer.playerState.reactive.gameMode === 'spectator') {
      const entity = bot.entities[packet.cameraId]
      appViewer.playerState.reactive.cameraSpectatingEntity = packet.cameraId
      if (entity) {
        updateCamera(entity)
        // do a force entity update
        bot.emit('entityUpdate', entity)
      }
    }
  })

  // Texture override from packet properties
  bot._client.on('player_info', (packet) => {
    const applySkinTexturesProxy = (url: string) => {
      const { appConfig } = miscUiState
      if (appConfig?.skinTexturesProxy) {
        return url?.replace('http://textures.minecraft.net/', appConfig.skinTexturesProxy)
          .replace('https://textures.minecraft.net/', appConfig.skinTexturesProxy)
      }
      return url
    }

    for (const playerEntry of packet.data) {
      if (!playerEntry.player && !playerEntry.properties) continue
      let textureProperty = playerEntry.properties?.find(prop => prop?.name === 'textures')
      if (!textureProperty) {
        textureProperty = playerEntry.player?.properties?.find(prop => prop?.key === 'textures')
      }
      if (textureProperty) {
        try {
          const textureData = JSON.parse(Buffer.from(textureProperty.value, 'base64').toString())
          const skinUrl = applySkinTexturesProxy(textureData.textures?.SKIN?.url)
          const capeUrl = applySkinTexturesProxy(textureData.textures?.CAPE?.url)

          // Find entity with matching UUID and update skin
          let entityId = ''
          for (const [entId, entity] of Object.entries(bot.entities)) {
            if (entity.uuid === playerEntry.uuid) {
              entityId = entId
              break
            }
          }
          // even if not found, still record to cache
          void getThreeJsRendererMethods()?.updatePlayerSkin(entityId, playerEntry.player?.name, playerEntry.uuid, skinUrl, capeUrl)
        } catch (err) {
          console.error('Error decoding player texture:', err)
        }
      }
    }

  })

  bot.on('teamUpdated', (team: Team) => {
    for (const entity of Object.values(bot.entities)) {
      if (entity.type === 'player' && entity.username && team.members.includes(entity.username) || entity.uuid && team.members.includes(entity.uuid)) {
        bot.emit('entityUpdate', entity)
      }
    }
  })

  const updateEntityNameTags = (team: Team) => {
    for (const entity of Object.values(bot.entities)) {
      const entityTeam = entity.type === 'player' && entity.username ? bot.teamMap[entity.username] : entity.uuid ? bot.teamMap[entity.uuid] : undefined
      if ((entityTeam?.nameTagVisibility === 'hideForOwnTeam' && entityTeam.name === team.name)
        || (entityTeam?.nameTagVisibility === 'hideForOtherTeams' && entityTeam.name !== team.name)) {
        bot.emit('entityUpdate', entity)
      }
    }
  }

  const doEntitiesNeedUpdating = (team: Team) => {
    return team.nameTagVisibility === 'never'
      || (team.nameTagVisibility === 'hideForOtherTeams' && appViewer.playerState.reactive.team?.team !== team.team)
      || (team.nameTagVisibility === 'hideForOwnTeam' && appViewer.playerState.reactive.team?.team === team.team)
  }

  bot.on('teamMemberAdded', (team: Team, members: string[]) => {
    if (members.includes(bot.username) && appViewer.playerState.reactive.team?.team !== team.team) {
      appViewer.playerState.reactive.team = team
      // Player was added to a team, need to check if any entities need updating
      updateEntityNameTags(team)
    } else if (doEntitiesNeedUpdating(team)) {
      // Need to update all entities that were added
      for (const entity of Object.values(bot.entities)) {
        if (entity.type === 'player' && entity.username && members.includes(entity.username) || entity.uuid && members.includes(entity.uuid)) {
          bot.emit('entityUpdate', entity)
        }
      }
    }
  })

  bot.on('teamMemberRemoved', (team: Team, members: string[]) => {
    if (members.includes(bot.username) && appViewer.playerState.reactive.team?.team === team.team) {
      appViewer.playerState.reactive.team = undefined
      // Player was removed from a team, need to check if any entities need updating
      updateEntityNameTags(team)
    } else if (doEntitiesNeedUpdating(team)) {
      // Need to update all entities that were removed
      for (const entity of Object.values(bot.entities)) {
        if (entity.type === 'player' && entity.username && members.includes(entity.username) || entity.uuid && members.includes(entity.uuid)) {
          bot.emit('entityUpdate', entity)
        }
      }
    }
  })

  bot.on('teamRemoved', (team: Team) => {
    if (appViewer.playerState.reactive.team?.team === team.team) {
      appViewer.playerState.reactive.team = undefined
      // Player's team was removed, need to update all entities that are in a team
      updateEntityNameTags(team)
    }
  })

})
