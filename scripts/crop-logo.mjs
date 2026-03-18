import sharp from 'sharp'

await sharp('public/northlogo.png')
  .trim({ threshold: 10 })
  .toFile('public/northlogo-cropped.png')

console.log('Done!')
