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
	var flags = mem.endpointFlags.map(n => Game.flags[n]);
	if (flags.length) {
		target = creep.pos.findNearestThing(function (room) {
			return this.findClosestByRange(flags);
		});
	} else {
		target = {};
		target.pos = new RoomPosition(25, 25, Memory.flags[mem.endpointFlags[0]].room);
	}

	if (target) {
		creep.memory.targetFlag = target.name;
		creep.memory.target = target.pos;
		creep.setGoing(target, 'evaluateEndpoints', 1, 'movingTarget2Courier');
	} else {

	}
};
Creep.prototype.movingTarget2Courier = function () {
	var creep = this;
	var target = creep.memory.target;
	var flag = Game.flags[creep.memory.targetFlag];

	// make sure that existing site is there
	if (!flag) {
		return new RoomPosition(25, 25, Memory.flags[creep.memory.targetFlag].room).pos;
	}

	var resource = flag.getSource();
	var structureType = flag.getBuilding();
	var id = flag.memory.targetId;

	// make sure that existing setup is consistent
	if (id && !Game.getObjectById(id)) {}

	// check if
	if (structureType) {
		var e;
	}

	return target.pos;
};

Creep.prototype.evaluateEndpoints = function () {};

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

Creep.prototype.waitCourier = function () {
    var creep = this;
    
    var target;
    var sinks = [];
    sinks = creep.room.find(FIND_MY_STRUCTURES, {filter:function (structure) {
        switch (structure.structureType) {
            case STRUCTURE_EXTENSION:
            case STRUCTURE_SPAWN:
                break;
            default:
                return false;
        }
        return structure.energy < structure.energyCapacity;
    }}).reduce(cat, sinks);
    
    target = creep.pos.findClosestByPath(sinks);
    
    if (target) {
        creep.memory.site = target.id;
        creep.memory.destination.then = 'runCourier';
        creep.memory.destination.range = 1;
        creep.setRun('gotoThen');
        
    } else {
        creep.say('all full');
    }
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