/*
 * Module code goes here. Use 'module.exports' to export things:
 * module.exports.thing = 'a thing';
 *
 * You can import it from another modules like this:
 * var mod = require('courier');
 * mod.thing == 'a thing'; // true
 */

require('CreepFactory');
//var PriorityQueue = require('pqueue');
var utils = require('utils');
var strerror = utils.strerror;

var BUILDING = 0;
var UPGRADING = 1;
var FILLING = 2;

var cat = function (arr, el) {
    arr.push(el);
    return arr;
};

var countResources = function (name, resourceType) {
	Memory.flags[name].recent = Memory.flags[name].recent || {};
	var count = Memory.flags[name].recent[resourceType] || 0;

	try {
		var flag = Game.flags[name];
		var pos = flag.pos;
		var range = flag.getBuilding() === STRUCTURE_EXTENSION ? 1 : 0;

		count = flag.room.lookForAtArea(LOOK_STRUCTURES, pos.y-range, pos.x-range,pos.y+range, pos.x+range, true).reduce(function (count, structure) {
			if (typeof structure.energy !== 'undefined' && resourceType === RESOURCE_ENERGY) {
				count += structure.energy;
			} else if (typeof structure.store !== 'undefined') {
				count += structure.store[resourceType]
			}
			return count;
		},0);
		count = flag.room.lookForAtArea(LOOK_RESOURCES, pos.y-range, pos.x-range,pos.y+range, pos.x+range, true).filter(r => r.resourceType === reousrceType).reduce((c, o) => c + o.amount, count)

	} catch (error) {}

	Memory.flags[name].recent[resourceType] = count;

	return count;
};

var getTargetPosition = function (creep, flag) {
	var source = flag.getSource();
	var target = flag.pos;
	if (source) {
		var spots = flag.room.openSpotsNear(flag);
		target = spots.reduce(function (pos, spot) {
			if (pos) {
				return pos;
			}

			var isContainer = s => s && s.structureType && s.structureType === STRUCTURE_CONTAINER;

			var pos2 = new RoomPosition(spot.x, spot.y, spot.roomName);

			if (pos2.lookFor(LOOK_STRUCTURES).filter(isContainer).length) {
				return spot;
			}

			if (pos2.lookFor(LOOK_CONSTRUCTION_SITES).filter(isContainer).length) {
				return spot;
			}

			return pos;

		}, undefined);
		if (!target) {
			var spawn = flag.pos.findNearestFriendlySpawn();
			target = spawn.pos.findClosestByRange(spots) ||
				flag.room.find(Map.findExit(creep.room, flag.room))[0].findClosestByRange(spots);
		}
	}

	var range = target.isWalkable() ? 0 : 1;

	var targetInfo = {
		'target': target,
		'range': range
	};

	return targetInfo;
};

var findNearestSource = function (pos) {
    var room = Game.rooms[pos.roomName];
    var sources = [];
    //sources = room.find(FIND_SOURCES).reduce(cat, sources);
    sources = room.find(FIND_DROPPED_RESOURCES, {filter:{resourceType: RESOURCE_ENERGY}}).reduce(cat, sources);
    sources = room.find(FIND_STRUCTURES, {filter:function(structure){return structure.structureType===STRUCTURE_CONTAINER && structure.store[RESOURCE_ENERGY]}}).reduce(cat, sources);

    sources = _.sortBy(sources, function (source) {
        var energy;

        if (source.store && source.store[RESOURCE_ENERGY]) {
            energy = source.store[RESOURCE_ENERGY];
        } else if (source.amount) {
            energy = source.amount;
        }

        return -energy;
    });

    var target = sources.reduce(function (obj, source) {
        if (Object.keys(obj).length) {
            return obj;
        }

        if (pos.findPathTo(source)) {
            return source;
        }
    }, {});

    return target;
};

Spawn.prototype.makeCourier = function (init) {
    init = init || {};
    var mem = {};

	if (init.endpointFlags) {
		mem.endpointFlags = init.endpointFlags;
		mem.run = 'startCourier';
		mem.genesis = 'makeCourier';
		mem.resource = init.resource || RESOURCE_ENERGY;

	} else {
		mem.run = 'gotoThen';
		mem.state = FILLING;
		mem.genesis = 'makeCourier';

		var destinationInfo = {
			'range': 1,
			'then': 'fillCourier'
		};

		var target = findNearestSource(this.pos);
		destinationInfo.target = target.pos;
		destinationInfo.source = target.id;

		mem.destination = destinationInfo;

	}

    var body = [MOVE, CARRY]; // bare minimum creep body definition
    var extras = [MOVE, CARRY, MOVE, CARRY];
    var bonus = [];
    var extraBonus = [MOVE, CARRY];
    
    return this.CreepFactory(body, mem, extras, bonus, extraBonus);
};

Creep.prototype.startCourier = function () {
    var creep = this;
	var mem = creep.memory;
	var target;
	var range = 1;
	var flags = mem.endpointFlags.map(n => Game.flags[n]);
	var movingTarget;
	try {
		var targetInfo;
		try {
			targetInfo = getTargetPosition(creep, flags[0]);
		} catch (err) {
			targetInfo = getTargetPosition(creep, flags[1]);
		}
		target = targetInfo.target;
		range = targetInfo.range;

	} catch (error) {

		var flagRooms = mem.endpointFlags.reduce((o, n) => {o[Memory.flags[n].room] = true; return o}, {});
		var targetRoom = creep.findNearestThing(r => flagRooms[r.name]);
		target = {};
		target.pos = new RoomPosition(25, 25, targetRoom);
		movingTarget = 'checkRoomCourier';

	}

	if (target) {
		creep.memory.targetFlag = target.name;
		creep.memory.target = target.pos;
		creep.setGoing(target, 'run2Courier', range, movingTarget);
	} else {

	}
};

Creep.prototype.checkRoomCourier = function () {
	var creep = this;
	var mem = creep.memory;
	var target;
	try  {
		var flag = Game.flags[mem.targetFlag];
		target = flag.pos;
		var targetInfo = getTargetPosition(creep, flag);
		target = targetInfo.target;
		creep.memory.destination.range = targetInfo.range;
		delete creep.memory.destination.movingTarget;
	} catch (error) {
		target = creep.memory.target;
	}

	return target;
};

Creep.prototype.run2Courier = function () {
	var creep = this;
	var target = creep.memory.target;
	var flag = Game.flags[creep.memory.targetFlag];
	var otherFlag = creep.memory.endpointFlags.filter(n => n !== creep.memory.targetFlag)[0];
	var res;
	if (creep.room.name !== Memory.flags[creep.memory.targetFlag].room || !creep.pos.isNearTo(flag)) {
		creep.memory.target = flag.pos;
		creep.setGoing(flag, 'run2Courier', 1, 'checkRoomCourier');
		return;
	}

	var otherIsSource;
	var otherIsSink;
	try {
		let of = Game.flags[otherFlag];
		let s = of.getSource();
		let b = of.getBuilding();
		otherIsSource = s;
		otherIsSink = !s && b !== STRUCTURE_CONTAINER && b !== STRUCTURE_STORAGE;
	} catch (err) {

	}

	var resourceHere = countResources(creep.memory.targetFlag, creep.memory.resource);
	var lastCheckedOther = Memory.flags[otherFlag].recent[creep.memory.resource] || 0;
	var targetBuilding = target.lookFor(LOOK_STRUCTURES).filter(s => s.structureType !== STRUCTURE_ROAD && s.structureType !== STRUCTURE_RAMPART)[0];
	var totalCarry = _.sum(creep.carry);
	// check what want to do
	// if at a source, withdraw
	if ((flag.isAnySource() || otherIsSink) && totalCarry < creep.carryCapacity) {
		// look at what source it is
		creep.takeResource(targetBuilding, creep.memory.resource);

	// if at a sink, deposit
	} else if ((flag.isAnySink() || otherIsSource)  && totalCarry > 0) {
		res = giveEnergyToSink(creep, targetBuilding, flag);
		if (res === ERR_FULL) {
			let b = flag.getBuilding();
			if (b === STRUCTURE_CONTAINER || b === STRUCTURE_STORAGE) {
				creep.drop(creep.memory.resource);
			}
		}

	// if at a node, compare to other node
	} else if (totalCarry !== 0 && totalCarry !== creep.carryCapacity) {

		creep.log('gotta write xfer stuff')
	}

	totalCarry =  _.sum(creep.carry);
	if (totalCarry === 0 || totalCarry === creep.carryCapacity) {
		creep.memory.targetFlag = otherFlag;
		var range = Game.flags[otherFlag].pos.isWalkable() ? 0 : 1;
		creep.setGoing(Game.flags[otherFlag].pos, 'run2Courier', range);
	}
};

var giveEnergyToSink = function (creep, target, flag) {
	var building = flag.getBuilding();
	target = [target];
	if (building === STRUCTURE_EXTENSION) {
		count = flag.room.lookForAtArea(LOOK_STRUCTURES, pos.y-range, pos.x-range,pos.y+range, pos.x+range, true)
			.filter(s => s.structureType === STRUCTURE_EXTENSION && s.energy < s.energyCapacity )[0];

		}
};


Creep.prototype.movingTargetCourier = function () {
    var creep = this;
    var target;
    var sinks = [];

	if (creep.room.warZone) {
		sinks = creep.room.find(FIND_MY_STRUCTURES, {filter:function (structure) {
			switch (structure.structureType) {
				case STRUCTURE_TOWER:
					break;
				default:
					return false;
			}
			return structure.energy < structure.energyCapacity;
		}}).reduce(cat, sinks);

		if (!sinks.length) {
			sinks = creep.room.find(FIND_MY_STRUCTURES, {filter:function (structure) {
				if (structure.structureType === STRUCTURE_EXTENSION || structure.structureType === STRUCTURE_SPAWN) {
					return structure.energy < structure.energyCapacity;
				}
			}}).reduce(cat, sinks);
		}
		if (!sinks.length) {
			sinks = creep.room.find(FIND_MY_STRUCTURES, {filter:function (structure) {
				if (structure.structureType === STRUCTURE_STORAGE) {
					return _.sum(structure.store) < structure.storeCapacity;
				}
			}}).reduce(cat, sinks);
		}
	} else {
		sinks = creep.room.find(FIND_MY_STRUCTURES, {filter:function (structure) {
			if (structure.structureType === STRUCTURE_EXTENSION || structure.structureType === STRUCTURE_SPAWN) {
				return structure.energy < structure.energyCapacity;
			}
		}}).reduce(cat, sinks);

		if (!sinks.length) {
			sinks = creep.room.find(FIND_MY_STRUCTURES, {filter:function (structure) {
				switch (structure.structureType) {
					case STRUCTURE_TOWER:
						break;
					default:
						return false;
				}
				return structure.energy < structure.energyCapacity;
			}}).reduce(cat, sinks);
		}
		if (!sinks.length) {
			sinks = creep.room.find(FIND_MY_STRUCTURES, {filter:function (structure) {
				if (structure.structureType === STRUCTURE_STORAGE) {
					return _.sum(structure.store) < structure.storeCapacity;
				}
			}}).reduce(cat, sinks);
		}
	}
    
    target = creep.pos.findClosestByPath(sinks);

	// try to find a construction site to dump into a container near
	if (!target) {
		var site = creep.room.find(FIND_MY_CONSTRUCTION_SITES).sort(s => s.progressTotal / s.progress)[0];

		if (site) {
			target = site.pos.findClosestByRange(FIND_STRUCTURES, {filter: s => s.structureType === STRUCTURE_CONTAINER && s.id !== creep.memory.destination.source && _.sum(s.store) + creep.carry[RESOURCE_ENERGY] <= s.storeCapacity });
		}
	}

    if (!target) {
        //console.log('builder found moving target: controller')
        creep.memory.destination.then = 'upgradeCourier';
        creep.memory.destination.range = 3;



        target = creep.room.find(FIND_MY_CONSTRUCTION_SITES)[0];
    } else {
        creep.memory.site = target.id;
        creep.memory.destination.then = 'runCourier';
        creep.memory.destination.range = 1;
    }
    
    if (!target) {
        return;
    }
    return target.pos;
};

Creep.prototype.fillCourier = function () {
    var creep = this;
    var source = Game.getObjectById(creep.memory.destination.source);
    if (_.sum(creep.carry) >= creep.carryCapacity || !source) {
        creep.say('full');
        creep.memory.destination.movingTarget = 'movingTargetCourier';
        creep.memory.destination.then = 'runCourier';
        creep.setRun('gotoThen');
        return;
    }
    
    
    var res;
    switch (source.structureType) {
        case STRUCTURE_CONTAINER:
        case STRUCTURE_STORAGE:
            res = source.transfer(creep, RESOURCE_ENERGY);
            break;
        default:
            break;
    }
    if (typeof res === 'undefined') {
        if (source.resourceType===RESOURCE_ENERGY) {
            res = creep.pickup(source);
        } else if (source.energy) {
            res = creep.harvest(source);
        } else {
        }
    }
    if (res === ERR_NOT_ENOUGH_ENERGY) {
        creep.say('empty');
        source = findNearestSource(creep.pos);
        if (!source) {
            return;
        }
	    delete creep.memory.destination.movingTarget;
	    creep.memory.destination.target = source.pos;
        creep.memory.destination.source = source.id;
        creep.memory.destination.then ='fillCourier';
        creep.memory.destination.range = 1;
        creep.setRun('gotoThen');
    } else if (res !== OK) {
        console.log('error filling courier ' + creep.name + ':' + strerror(res));
    }
};

Creep.prototype.upgradeCourier = function () {
    var creep = this;
    if (_.sum(creep.carry) <= 0) {
        creep.say('empty');
        var source = findNearestSource(creep.pos);
        if (!source) {
            return;
        }
	    delete creep.memory.destination.movingTarget;
	    creep.memory.destination.target = source.pos;
        creep.memory.destination.source = source.id;
        creep.memory.destination.then ='fillCourier';
        creep.memory.destination.range = 1;
        creep.setRun('gotoThen');
        return;
    }
    
    var res = creep.drop(RESOURCE_ENERGY);
    if (res !== OK) {
        console.log('harvester ' + creep.name + ' unable to upgrade room ' + creep.room.name + ':' + strerror(res));
        delete creep.memory.destination.movingTarget;
        creep.memory.destination.then = 'fillCourier';
        creep.setRun('gotoThen');
    }
};

Creep.prototype.runCourier = function () {
    var creep = this;
    var res;
    var site = Game.getObjectById(creep.memory.site);

	var totalCarrying = _.sum(creep.carry);
    if (totalCarrying <= 0 || (!site || site.energy >= site.energyCapacity) && totalCarrying < 50) {
        var source = findNearestSource(creep.pos);
        if (!source) {
            return;
        }
	    delete creep.memory.destination.movingTarget;
	    creep.memory.destination.target = source.pos;
        creep.memory.destination.source = source.id;
        creep.memory.destination.then = 'fillCourier';
        creep.memory.destination.range = 1;
        creep.setRun('gotoThen');
        return;
    }

	if (!site || site.energy >= site.energyCapacity) {
		creep.memory.destination.movingTarget = 'movingTargetCourier';
		creep.memory.destination.then = 'runCourier';
		creep.setRun('gotoThen');
		return;
	}

    res = creep.transfer(site, RESOURCE_ENERGY);
    if (res !== OK) {
        console.log('harvester ' + creep.name + 'cannot transfer to site:' + site.id + ':' +strerror(res));
    } else {
        //creep.memory.pq = new PriorityQueue(creep.memory.pq).queue(0, site.id);
    }
    
    
};

module.exports = {};