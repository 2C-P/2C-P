import { Vec3 } from 'vec3'
import PItem from 'prismarine-item'
import * as THREE from 'three'
import { WorldRendererThree } from '../renderer/viewer/lib/worldrendererThree'
import { options } from './optionsStorage'
import { jeiCustomCategories } from './inventoryWindows'

customEvents.on('mineflayerBotCreated', async () => {
  if (!options.customChannels) return
  await new Promise(resolve => {
    bot.once('login', () => {
      resolve(true)
    })
  })
  registerBlockModelsChannel()
  registerMediaChannels()
  registeredJeiChannel()
})

const registerBlockModelsChannel = () => {
  const CHANNEL_NAME = 'minecraft-web-client:blockmodels'

  const packetStructure = [
    'container',
    [
      {
        name: 'worldName', // currently not used
        type: ['pstring', { countType: 'i16' }]
      },
      {
        name: 'x',
        type: 'i32'
      },
      {
        name: 'y',
        type: 'i32'
      },
      {
        name: 'z',
        type: 'i32'
      },
      {
        name: 'model',
        type: ['pstring', { countType: 'i16' }]
      }
    ]
  ]

  bot._client.registerChannel(CHANNEL_NAME, packetStructure, true)

  bot._client.on(CHANNEL_NAME as any, (data) => {
    const { worldName, x, y, z, model } = data

    const chunkX = Math.floor(x / 16) * 16
    const chunkZ = Math.floor(z / 16) * 16
    const chunkKey = `${chunkX},${chunkZ}`
    const blockPosKey = `${x},${y},${z}`

    const chunkModels = viewer.world.protocolCustomBlocks.get(chunkKey) || {}

    if (model) {
      chunkModels[blockPosKey] = model
    } else {
      delete chunkModels[blockPosKey]
    }

    if (Object.keys(chunkModels).length > 0) {
      viewer.world.protocolCustomBlocks.set(chunkKey, chunkModels)
    } else {
      viewer.world.protocolCustomBlocks.delete(chunkKey)
    }

    // Trigger update
    if (worldView) {
      const block = worldView.world.getBlock(new Vec3(x, y, z))
      if (block) {
        worldView.world.setBlockStateId(new Vec3(x, y, z), block.stateId)
      }
    }

  })

  console.debug(`registered custom channel ${CHANNEL_NAME} channel`)
}

const registeredJeiChannel = () => {
  const CHANNEL_NAME = 'minecraft-web-client:jei'
  // id - string, categoryTitle - string, items - string (json array)
  const packetStructure = [
    'container',
    [
      {
        name: 'id',
        type: ['pstring', { countType: 'i16' }]
      },
      {
        name: '_categoryTitle',
        type: ['pstring', { countType: 'i16' }]
      },
      {
        name: 'items',
        type: ['pstring', { countType: 'i16' }]
      },
    ]
  ]

  bot._client.registerChannel(CHANNEL_NAME, packetStructure, true)

  bot._client.on(CHANNEL_NAME as any, (data) => {
    const { id, categoryTitle, items } = data
    if (items === '') {
      // remove category
      jeiCustomCategories.value = jeiCustomCategories.value.filter(x => x.id !== id)
      return
    }
    const PrismarineItem = PItem(bot.version)
    jeiCustomCategories.value.push({
      id,
      categoryTitle,
      items: JSON.parse(items).map(x => {
        const itemString = x.itemName || x.item_name || x.item || x.itemId
        const itemId = loadedData.itemsByName[itemString.replace('minecraft:', '')]
        if (!itemId) {
          console.warn(`Could not add item ${itemString} to JEI category ${categoryTitle} because it was not found`)
          return null
        }
        // const item = new PrismarineItem(itemId.id, x.itemCount || x.item_count || x.count || 1, x.itemDamage || x.item_damage || x.damage || 0, x.itemNbt || x.item_nbt || x.nbt || null)
        return PrismarineItem.fromNotch({
          ...x,
          itemId: itemId.id,
        })
      })
    })
  })

  console.debug(`registered custom channel ${CHANNEL_NAME} channel`)
}

const registerMediaChannels = () => {
  // Media Add Channel
  const ADD_CHANNEL = 'minecraft-web-client:media-add'
  const addPacketStructure = [
    'container',
    [
      { name: 'id', type: ['pstring', { countType: 'i16' }] },
      { name: 'x', type: 'f32' },
      { name: 'y', type: 'f32' },
      { name: 'z', type: 'f32' },
      { name: 'width', type: 'f32' },
      { name: 'height', type: 'f32' },
      // N, 0
      // W, 3
      // S, 2
      // E, 1
      { name: 'rotation', type: 'i16' }, // 0: 0° - towards positive z, 1: 90° - positive x, 2: 180° - negative z, 3: 270° - negative x (3-6 is same but double side)
      { name: 'source', type: ['pstring', { countType: 'i16' }] },
      { name: 'loop', type: 'bool' },
      { name: '_volume', type: 'f32' }, // 0
      { name: '_aspectRatioMode', type: 'i16' }, // 0
      { name: '_background', type: 'i16' }, // 0
      { name: '_opacity', type: 'i16' }, // 1
      { name: '_cropXStart', type: 'f32' }, // 0
      { name: '_cropYStart', type: 'f32' }, // 0
      { name: '_cropXEnd', type: 'f32' }, // 0
      { name: '_cropYEnd', type: 'f32' }, // 0
    ]
  ]

  // Media Control Channels
  const PLAY_CHANNEL = 'minecraft-web-client:media-play'
  const PAUSE_CHANNEL = 'minecraft-web-client:media-pause'
  const SEEK_CHANNEL = 'minecraft-web-client:media-seek'
  const VOLUME_CHANNEL = 'minecraft-web-client:media-volume'
  const SPEED_CHANNEL = 'minecraft-web-client:media-speed'
  const DESTROY_CHANNEL = 'minecraft-web-client:media-destroy'

  const noDataPacketStructure = [
    'container',
    [
      { name: 'id', type: ['pstring', { countType: 'i16' }] }
    ]
  ]

  const setNumberPacketStructure = [
    'container',
    [
      { name: 'id', type: ['pstring', { countType: 'i16' }] },
      { name: 'seconds', type: 'f32' }
    ]
  ]

  // Register channels
  bot._client.registerChannel(ADD_CHANNEL, addPacketStructure, true)
  bot._client.registerChannel(PLAY_CHANNEL, noDataPacketStructure, true)
  bot._client.registerChannel(PAUSE_CHANNEL, noDataPacketStructure, true)
  bot._client.registerChannel(SEEK_CHANNEL, setNumberPacketStructure, true)
  bot._client.registerChannel(VOLUME_CHANNEL, setNumberPacketStructure, true)
  bot._client.registerChannel(SPEED_CHANNEL, setNumberPacketStructure, true)
  bot._client.registerChannel(DESTROY_CHANNEL, noDataPacketStructure, true)

  // Handle media add
  bot._client.on(ADD_CHANNEL as any, (data) => {
    const { id, x, y, z, width, height, rotation, source, loop, background, opacity } = data

    const worldRenderer = viewer.world as WorldRendererThree

    // Destroy existing video if it exists
    worldRenderer.destroyMedia(id)

    // Add new video
    worldRenderer.addMedia(id, {
      position: { x, y, z },
      size: { width, height },
      // side: 'towards',
      src: source,
      rotation: rotation as 0 | 1 | 2 | 3,
      doubleSide: false,
      background,
      opacity: opacity / 100,
      allowOrigins: options.remoteContentNotSameOrigin === false ? [getCurrentTopDomain()] : options.remoteContentNotSameOrigin
    })

    // Set loop state
    if (!loop) {
      const videoData = worldRenderer.customMedia.get(id)
      if (videoData?.video) {
        videoData.video.loop = false
      }
    }
  })

  // Handle media play
  bot._client.on(PLAY_CHANNEL as any, (data) => {
    const { id } = data
    const worldRenderer = viewer.world as WorldRendererThree
    worldRenderer.setVideoPlaying(id, true)
  })

  // Handle media pause
  bot._client.on(PAUSE_CHANNEL as any, (data) => {
    const { id } = data
    const worldRenderer = viewer.world as WorldRendererThree
    worldRenderer.setVideoPlaying(id, false)
  })

  // Handle media seek
  bot._client.on(SEEK_CHANNEL as any, (data) => {
    const { id, seconds } = data
    const worldRenderer = viewer.world as WorldRendererThree
    worldRenderer.setVideoSeeking(id, seconds)
  })

  // Handle media destroy
  bot._client.on(DESTROY_CHANNEL as any, (data) => {
    const { id } = data
    const worldRenderer = viewer.world as WorldRendererThree
    worldRenderer.destroyMedia(id)
  })

  // Handle media volume
  bot._client.on(VOLUME_CHANNEL as any, (data) => {
    const { id, volume } = data
    const worldRenderer = viewer.world as WorldRendererThree
    worldRenderer.setVideoVolume(id, volume)
  })

  // Handle media speed
  bot._client.on(SPEED_CHANNEL as any, (data) => {
    const { id, speed } = data
    const worldRenderer = viewer.world as WorldRendererThree
    worldRenderer.setVideoSpeed(id, speed)
  })

  // ---

  // Video interaction channel
  const interactionPacketStructure = [
    'container',
    [
      { name: 'id', type: ['pstring', { countType: 'i16' }] },
      { name: 'x', type: 'f32' },
      { name: 'y', type: 'f32' },
      { name: 'isRightClick', type: 'bool' }
    ]
  ]

  bot._client.registerChannel(MEDIA_INTERACTION_CHANNEL, interactionPacketStructure, true)

  console.debug('Registered media channels')
}

const MEDIA_INTERACTION_CHANNEL = 'minecraft-web-client:media-interaction'

export const sendVideoInteraction = (id: string, x: number, y: number, isRightClick: boolean) => {
  bot._client.writeChannel(MEDIA_INTERACTION_CHANNEL, { id, x, y, isRightClick })
}

export const videoCursorInteraction = () => {
  const worldRenderer = viewer.world as WorldRendererThree
  const { camera } = worldRenderer
  const raycaster = new THREE.Raycaster()

  // Get mouse position at center of screen
  const mouse = new THREE.Vector2(0, 0)

  // Update the raycaster
  raycaster.setFromCamera(mouse, camera)

  // Check intersection with all video meshes
  for (const [id, videoData] of worldRenderer.customMedia.entries()) {
    // Get the actual mesh (first child of the group)
    const mesh = videoData.mesh.children[0] as THREE.Mesh
    if (!mesh) continue

    const intersects = raycaster.intersectObject(mesh, false)
    if (intersects.length > 0) {
      const intersection = intersects[0]
      const { uv } = intersection
      if (!uv) return null

      return {
        id,
        x: uv.x,
        y: uv.y
      }
    }
  }

  return null
}
window.videoCursorInteraction = videoCursorInteraction

const addTestVideo = (rotation = 0 as 0 | 1 | 2 | 3, scale = 1, isImage = false) => {
  const block = window.cursorBlockRel()
  if (!block) return
  const { position: startPosition } = block

  const worldRenderer = viewer.world as WorldRendererThree

  // Add video with proper positioning
  worldRenderer.addMedia('test-video', {
    position: {
      x: startPosition.x,
      y: startPosition.y + 1,
      z: startPosition.z
    },
    size: {
      width: scale,
      height: scale
    },
    src: isImage ? 'https://bucket.mcraft.fun/test_image.png' : 'https://bucket.mcraft.fun/test_video.mp4',
    rotation,
    // doubleSide: true,
    background: 0x00_00_00, // Black color
    // TODO broken
    // uvMapping: {
    //   startU: 0,
    //   endU: 1,
    //   startV: 0,
    //   endV: 1
    // },
    opacity: 1,
    allowOrigins: true,
  })
}
window.addTestVideo = addTestVideo

function getCurrentTopDomain (): string {
  const { hostname } = location
  // Split hostname into parts
  const parts = hostname.split('.')

  // Handle special cases like co.uk, com.br, etc.
  if (parts.length > 2) {
    // Check for common country codes with additional segments
    if (parts.at(-2) === 'co' ||
      parts.at(-2) === 'com' ||
      parts.at(-2) === 'org' ||
      parts.at(-2) === 'gov') {
      // Return last 3 parts (e.g., example.co.uk)
      return parts.slice(-3).join('.')
    }
  }

  // Return last 2 parts (e.g., example.com)
  return parts.slice(-2).join('.')
}
