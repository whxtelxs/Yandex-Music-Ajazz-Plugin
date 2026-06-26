'use strict';

module.exports = `
function ymGetVibeTrackTitle() {
  var nodes = document.querySelectorAll('[class*="VibePlayerbarMeta_trackNameText"]');
  for (var i = 0; i < nodes.length; i++) {
    var text = (nodes[i].textContent || '').trim();
    if (text) return text;
  }
  return '';
}

function ymGetVibeTrackArtist() {
  var names = [];
  var meta = document.querySelector('[class*="VibePage_entityMeta"]');

  if (meta) {
    var separatedBlocks = meta.querySelectorAll('[class*="SeparatedArtists"]');
    for (var s = 0; s < separatedBlocks.length; s++) {
      var block = separatedBlocks[s];
      var blockTitle = block.getAttribute('title');
      if (blockTitle && blockTitle.trim()) names.push(blockTitle.trim());
      var blockLinks = block.querySelectorAll('a[href*="artist"]');
      for (var bl = 0; bl < blockLinks.length; bl++) {
        var blockName = ymParseArtistLink(blockLinks[bl]);
        if (blockName) names.push(blockName);
      }
    }

    if (!names.length) {
      var metaLinks = meta.querySelectorAll('a[href*="artist"]');
      for (var ml = 0; ml < metaLinks.length; ml++) {
        var metaName = ymParseArtistLink(metaLinks[ml]);
        if (metaName) names.push(metaName);
      }
    }
  }

  if (!names.length) {
    var dynamicRoots = document.querySelectorAll('[class*="VibeDynamicArtists"]');
    for (var d = 0; d < dynamicRoots.length; d++) {
      var dynamicLinks = dynamicRoots[d].querySelectorAll('a[href*="artist"]');
      for (var dl = 0; dl < dynamicLinks.length; dl++) {
        var dynamicName = ymParseArtistLink(dynamicLinks[dl]);
        if (dynamicName) names.push(dynamicName);
      }
    }
  }

  if (!names.length) {
    var fallbackLink = document.querySelector('[class*="VibeDynamicArtists"] a[href*="artist"]')
      || document.querySelector('[class*="SeparatedArtists"] a[href*="artist"]')
      || document.querySelector('[class*="VibePage_entityMeta"] a[href*="artist"]');
    var fallbackName = ymParseArtistLink(fallbackLink);
    if (fallbackName) names.push(fallbackName);
  }

  return ymUniqueNonEmpty(names).join(', ');
}
`;
